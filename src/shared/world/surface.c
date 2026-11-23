#include "surface.h"
#include "world_texture.h"
#include "audio.h"
#include "snapshot_types.h"
#include "tm3/projectile_motion.h"
#include "tm4/fixed.h"
#include "tm4/gpu_packet.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/render.h"
#include "tm4/main/system.h"
#include "tm4/main/world.h"
#include <STDARG.H>
#include <psyz/gte.h>
#include <stdlib.h>
#include <string.h>

enum { Splash, Dust, Spray };
static const u8 material_offset[] = { 18, 11, 25 };
static const s16 minimum_speed[] = { 1537, 626, 1537 };
static char tracker_class[] = "tm3WheelSurface", particle_class[] = "tm3SurfaceParticle";
const SnapshotField Tm3WheelSurfaceFields[] = {
    SNAP_WEAK_REF(Tm3WheelSurface, active[0], "tm3TireMark"),
    SNAP_WEAK_REF(Tm3WheelSurface, active[1], "tm3TireMark"),
    SNAP_WEAK_REF(Tm3WheelSurface, active[2], "tm3TireMark"),
    SNAP_WEAK_REF(Tm3WheelSurface, active[3], "tm3TireMark"),
    SNAP_POD(Tm3WheelSurface, finished),
    SNAP_POD(Tm3WheelSurface, skid_sample),
    SNAP_POD(Tm3WheelSurface, skid_volume),
    SNAP_POD(Tm3WheelSurface, delay),
    { 0 },
};
const SnapshotField Tm3SurfaceParticleFields[] = {
    SNAP_POD(Tm3SurfaceParticle, position.vx),
    SNAP_POD(Tm3SurfaceParticle, position.vy),
    SNAP_POD(Tm3SurfaceParticle, position.vz),
    SNAP_POD(Tm3SurfaceParticle, velocity.vx),
    SNAP_POD(Tm3SurfaceParticle, velocity.vy),
    SNAP_POD(Tm3SurfaceParticle, velocity.vz),
    SNAP_POD(Tm3SurfaceParticle, width),
    SNAP_POD(Tm3SurfaceParticle, height),
    SNAP_POD(Tm3SurfaceParticle, rise),
    SNAP_POD(Tm3SurfaceParticle, family),
    SNAP_POD(Tm3SurfaceParticle, material),
    SNAP_POD(Tm3SurfaceParticle, frame),
    SNAP_POD(Tm3SurfaceParticle, flip),
    SNAP_POD(Tm3SurfaceParticle, shade),
    SNAP_POD(Tm3SurfaceParticle, growing),
    SNAP_POD(Tm3SurfaceParticle, timer),
    { 0 },
};

static const u8* material(int index)
{
    const u8* rows = RegGetFileDataS("/world/wheelMaterials");
    return rows + index * 32;
}

static int clamp(int x, int low, int high)
{
    return x < low ? low : x > high ? high : x;
}

static s32 tracker_init(Tm3WheelSurface* t, va_list args)
{
    memset(t, 0, sizeof(*t));
    return 1;
}

static void tracker_step(void* instance, const Rm4SurfaceFrame* frame)
{
    Tm3WheelSurface* tracker = instance;
    Car* car = ObjectGetHeader(tracker)->owner;
    const Rm4WheelContact* loudest = NULL;
    for (int index = 0; index < RM4_SURFACE_WHEELS; ++index) {
        const Rm4WheelContact* contact = &frame->wheels[index];
        if (!contact->touching) {
            Tm3TrackWheel(tracker, index, NULL, NULL);
            memset(tracker->delay[index], 0, sizeof(tracker->delay[index]));
            continue;
        }
        const u8* row = material(contact->material);
        Tm3TrackWheel(tracker, index, contact, row);
        if (row[4] && contact->slip_speed_q12 > 0x400000
            && (!loudest || contact->slip_speed_q12 > loudest->slip_speed_q12))
            loudest = contact;
        VECTOR velocity = contact->velocity;
        int speed = VectorLength0(&velocity);
        for (int family = Splash; family <= Spray; ++family) {
            if (speed < minimum_speed[family] || !row[material_offset[family]])
                continue;
            u8* delay = &tracker->delay[index][family];
            if (*delay) {
                --*delay;
                continue;
            }
            ObjectCreate(
                particle_class, 0, family, contact->material, &contact->position, &velocity, speed);
            *delay = 5;
        }
    }
    Tm3UpdateSkidSound(tracker, car, loudest);
    Tm3SurfaceAudio(car, frame);
}

static void tracker_reset(void* instance, Rm4SurfaceReset reason)
{
    Tm3WheelSurface* tracker = instance;
    for (int index = 0; index < RM4_SURFACE_WHEELS; ++index)
        Tm3TrackWheel(tracker, index, NULL, NULL);
    memset(tracker->delay, 0, sizeof(tracker->delay));
    Tm3ResetSkidSound(tracker, ObjectGetHeader(tracker)->owner);
}

const Rm4SurfaceEffects Tm3SurfaceEffects = {
    .version = RM4_SURFACE_EFFECTS_VERSION,
    .size = sizeof(Rm4SurfaceEffects),
    .flags = RM4_SURFACE_REPLACE_CONTACT_AUDIO,
    .instance_class = "tm3WheelSurface",
    .step = tracker_step,
    .reset = tracker_reset,
};

static int velocity_step(s32 value, int fraction)
{
    return Q12MulRound((value * 8738 + (1 << 17)) >> 18, fraction);
}

// Class 26 (splash), 27 (dust), 28 (spray), starting at 80038d1c.
static s32 particle_init(Tm3SurfaceParticle* p, va_list args)
{
    p->family = va_arg(args, int);
    p->material = va_arg(args, int);
    p->position = *va_arg(args, const SVECTOR*);
    const VECTOR* v = va_arg(args, const VECTOR*);
    int speed = va_arg(args, int);
    const u8* effect = material(p->material) + material_offset[p->family];
    /* The engine snapshots this effect stream separately from gameplay randomness. */
    p->frame = randrand() % effect[3];
    p->timer = effect[3] > 1 ? effect[4] : -1;
    p->flip = randrand() & 1;
    p->shade = 17 * WorldGetLight(p->position.vx, p->position.vz);
    p->rise = 0;
    p->velocity = (SVECTOR) { 0 };
    p->growing = 1;
    if (p->family == Splash) {
        p->width = clamp(speed, 128, 768);
        p->height = clamp(speed / 4, 512, 1280);
        p->rise = clamp(speed / 8 + 40, 0, 160);
        if (effect[6]) {
            int sample = effect[5] + randrand() % effect[6];
            Tm3PlayNamedSound(sample == 12 ? "tm3_s12" : "tm3_s28", &p->position, NULL, 1308, 0);
        }
    } else {
        int fraction = p->family == Dust ? 1365 : 2048;
        p->velocity.vx = velocity_step(v->vx, fraction);
        p->velocity.vy = velocity_step(v->vy, fraction);
        p->velocity.vz = velocity_step(v->vz, fraction);
        if (p->family == Dust) {
            p->width = speed / 16;
            p->height = speed / 32;
        } else {
            p->velocity.vy = -clamp(Q12MulRound(136, Q12MulRound(1365, speed)), 0, 24);
            p->width = clamp(Q12MulRound(64, speed) + randrand() % 16 - 8, 16, 32);
            p->height = clamp(Q12MulRound(64, speed) + randrand() % 16 - 8, 16, 32);
        }
    }
    ObjectSetPosition(p, p->position.vx, p->position.vy, p->position.vz);
    return 1;
}

static void particle_tick(Tm3SurfaceParticle* p)
{
    if (p->family == Splash) {
        p->height += p->rise;
        if (p->rise >= 0)
            p->width += 129;
        else if (p->height < 0) {
            ObjectDestroy(p);
            return;
        }
        p->rise -= 16;
    } else {
        SVECTOR previous = p->position;
        if (p->family == Spray)
            p->velocity.vy += 2;
        p->position.vx += p->velocity.vx;
        p->position.vy += p->velocity.vy;
        p->position.vz += p->velocity.vz;
        if (p->family == Spray) {
            Tm4WorldHit hit = { 0 };
            if (IntersectWorldWithRay(&previous, &p->position, 3, &hit) == 1) {
                ObjectDestroy(p);
                return;
            }
        } else if (p->growing) {
            p->width += 257;
            p->height += 129;
            p->growing = p->height < 1280;
        } else if (p->shade > 14)
            p->shade -= 14;
        else {
            ObjectDestroy(p);
            return;
        }
        ObjectSetPosition(p, p->position.vx, p->position.vy, p->position.vz);
    }
    if (p->timer >= 0 && --p->timer < 0) {
        const u8* effect = material(p->material) + material_offset[p->family];
        p->frame = (p->frame + 1) % effect[3];
        p->timer = effect[4];
    }
}

static void particle_draw(
    Tm3SurfaceParticle* p, Tm4OrderingTag* ot, u8** cursor, u8* limit, MATRIX* view)
{
    const Tm4CardTexture* atlas = RegGetFileDataS("/world/wheelAtlas");
    const u8* effect = material(p->material) + material_offset[p->family];
    const Tm4CardTexture* tile = &atlas[effect[2] + p->frame];
    if (*cursor + sizeof(POLY_FT4) >= limit)
        return;
    int transparent = p->family == Dust && !effect[1];
    u16 tpage = tile->uv.tpage;
    if (transparent)
        tpage = (tpage & 0x99f) | 0x20;
    int half = p->family == Spray ? p->width / 2 : p->width / 32;
    int height = p->family == Spray ? p->height : p->height / 16;
    SVECTOR quad[] = {
        { -half, -height, 0, 0 },
        { half, -height, 0, 0 },
        { -half, 0, 0, 0 },
        { half, 0, 0, 0 },
    };
    PushMatrix();
    SetRotMatrix(view);
    SetTransMatrix(view);
    if (p->family == Splash) {
        int32_t horizontal[3] = { view->m[0][0], 0, view->m[0][2] };
        int16_t axis[3];
        Tm3ProjectileNormalize(horizontal, axis);
        int dx = (half * axis[0]) >> 12, dz = (half * axis[2]) >> 12;
        for (int i = 0; i < 4; ++i) {
            quad[i].vx = p->position.vx + ((i & 1) ? dx : -dx);
            quad[i].vy += p->position.vy;
            quad[i].vz = p->position.vz + ((i & 1) ? dz : -dz);
        }
    } else {
        MATRIX billboard;
        VECTOR camera;
        Tm4GteFlag flags;
        RotTrans(&p->position, &camera, &flags);
        RotationMatrixY(0, &billboard);
        billboard.t[0] = camera.vx;
        billboard.t[1] = camera.vy;
        billboard.t[2] = camera.vz;
        SetRotMatrix(&billboard);
        SetTransMatrix(&billboard);
    }
    int xy[4], perspective, flags;
    RotTransPers3(quad, quad + 1, quad + 2, xy, xy + 1, xy + 2, &perspective, &flags);
    int depth = Psyz_GteDataRead(19);
    RotTransPers(quad + 3, xy + 3, &perspective, &flags);
    PopMatrix();
    if (!depth)
        return;
    int bucket = (depth >> 2) - 24;
    if (bucket < 0)
        bucket = 0;
    if ((u32)bucket >= otSize)
        return;
    POLY_FT4* packet = (void*)*cursor;
    setPolyFT4(packet);
    setSemiTrans(packet, transparent);
    setRGB0(packet, p->shade, p->shade, p->shade);
    setXY4(packet, (s16)xy[0], xy[0] >> 16, (s16)xy[1], xy[1] >> 16, (s16)xy[2], xy[2] >> 16,
        (s16)xy[3], xy[3] >> 16);
    u8 left = p->flip ? tile->uv.u1 : tile->uv.u0;
    u8 right = p->flip ? tile->uv.u0 : tile->uv.u1;
    setUV4(packet, left, tile->uv.v0, right, tile->uv.v0, left, tile->uv.v1, right, tile->uv.v1);
    packet->tpage = WebWorldTexturePage(tpage);
    packet->clut = tile->uv.clut;
    GpuLinkPacketSized(ot + bucket, packet, sizeof(*packet));
    *cursor += sizeof(*packet);
}

int Tm3SurfaceRegister(RegistryDirectory* dir)
{
    return Tm3RegisterTireMarks(dir)
        && ObjectRegisterClass(tracker_class, sizeof(Tm3WheelSurface), dir,
            (Tm4PackedConstructor)tracker_init, NULL, NULL, NULL, NULL)
        && ObjectRegisterClass(particle_class, sizeof(Tm3SurfaceParticle), dir,
            (Tm4PackedConstructor)particle_init, NULL, (Tm4ObjectCallback)particle_tick,
            (Tm4ObjectDisplayCallback)particle_draw, NULL);
}
