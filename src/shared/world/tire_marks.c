#include "mod_api.h"
#include "surface.h"
#include "tm4/fixed.h"
#include "tm4/gpu_packet.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/render.h"
#include "tm4/main/sound.h"
#include "tm4/main/system.h"
#include "tm4/main/world.h"
#include <STDARG.H>
#include <stdlib.h>
#include <string.h>

static char mark_class[] = "tm3TireMark";
const SnapshotField Tm3TireMarkFields[] = {
    SNAP_POD(Tm3TireMark, edge),
    SNAP_POD(Tm3TireMark, material),
    SNAP_POD(Tm3TireMark, first_shade),
    SNAP_POD(Tm3TireMark, last_shade),
    SNAP_POD(Tm3TireMark, sequence),
    SNAP_POD(Tm3TireMark, finished),
    { 0 },
};

static s32 mark_init(Tm3TireMark* mark, va_list args)
{
    memset(mark, 0, sizeof(*mark));
    return 1;
}

static void mark_tick(Tm3TireMark* mark)
{
    const Tm3WheelSurface* owner = ObjectGetHeader(mark)->owner;
    if (mark->finished && owner->finished - mark->sequence >= 32)
        ObjectDestroy(mark);
}

static void finish(Tm3WheelSurface* tracker, int wheel)
{
    Tm3TireMark* mark = tracker->active[wheel];
    if (mark) {
        mark->finished = 1;
        mark->sequence = ++tracker->finished;
        tracker->active[wheel] = NULL;
    }
}

// 80021890 constructs the ribbon across the actual movement, tangent to the contact plane.
void Tm3TrackWheel(Tm3WheelSurface* tracker, int wheel, const Rm4WheelContact* hit, const u8* row)
{
    if (!hit || !row[4] || hit->slip_speed_q12 <= 0x400000) {
        finish(tracker, wheel);
        return;
    }
    const SVECTOR* contact = &hit->position;
    SVECTOR movement = hit->movement, normal = hit->normal, side = { 0 };
    OuterProductSSS12(&movement, &normal, &side);
    int32_t tangent[3] = { side.vx, side.vy, side.vz };
    int16_t direction[3];
    Tm3ProjectileNormalize(tangent, direction);
    SVECTOR ends[2] = { *contact, *contact };
    for (int i = 0; i < 2; ++i) {
        int width = (i ? -hit->width : hit->width) / 2;
        ends[i].vx += Q12MulRound(width, direction[0]);
        ends[i].vy += Q12MulRound(width, direction[1]);
        ends[i].vz += Q12MulRound(width, direction[2]);
        ends[i].pad = 0;
    }
    if (tracker->active[wheel] && tracker->active[wheel]->material != hit->material)
        finish(tracker, wheel);
    Tm3TireMark* mark = tracker->active[wheel];
    int shade = 17 * WorldGetLight(contact->vx, contact->vz);
    if (mark) {
        int dx = abs(contact->vx - mark->edge[0].vx), dz = abs(contact->vz - mark->edge[0].vz);
        if (dx + dz - (dx < dz ? dx : dz) / 2 > 256) {
            memcpy(mark->edge + 2, ends, sizeof(ends));
            mark->last_shade = shade;
            finish(tracker, wheel);
            mark = NULL;
        }
    }
    if (!mark) {
        mark = ObjectCreate(mark_class, OBJECT_HAS_OWNER | OBJECT_DESTROY_WITH_OWNER, tracker);
        if (!mark)
            return;
        tracker->active[wheel] = mark;
        memcpy(mark->edge, ends, sizeof(ends));
        mark->material = hit->material;
        mark->first_shade = mark->last_shade = shade;
        ObjectSetPosition(mark, contact->vx, contact->vy, contact->vz);
    }
    memcpy(mark->edge + 2, ends, sizeof(ends));
}

static void mark_draw(Tm3TireMark* mark, Tm4OrderingTag* ot, u8** cursor, u8* limit, MATRIX* view)
{
    if (*cursor + sizeof(POLY_GT4) >= limit)
        return;
    PushMatrix();
    SetRotMatrix(view);
    SetTransMatrix(view);
    int xy[4], depth[4], f, p;
    for (int i = 0; i < 4; ++i)
        depth[i] = RotTransPers(mark->edge + i, xy + i, &p, &f);
    PopMatrix();
    int z = (depth[0] < depth[2] ? depth[0] : depth[2]) - 16;
    if (z <= 0 || !otSize)
        return;
    if (z >= (int)otSize)
        z = otSize - 1;
    const u8* materials = RegGetFileDataS("/world/wheelMaterials");
    const Tm4CardTexture* atlas = RegGetFileDataS("/world/wheelAtlas");
    const Tm4CardQuadTexture* shaders = RegGetFileDataS("/world/displayPolys/shaderData");
    const Tm4CardTexture* tile = atlas + materials[mark->material * 32 + 6];
    POLY_GT4* packet = (void*)*cursor;
    setPolyGT4(packet);
    int a = mark->first_shade, b = mark->last_shade;
    setRGB0(packet, a, a, a);
    setRGB1(packet, a, a, a);
    setRGB2(packet, b, b, b);
    setRGB3(packet, b, b, b);
    setXY4(packet, (s16)xy[0], xy[0] >> 16, (s16)xy[1], xy[1] >> 16, (s16)xy[2], xy[2] >> 16,
        (s16)xy[3], xy[3] >> 16);
    setUV4(packet, tile->uv.u0, tile->uv.v0, tile->uv.u1, tile->uv.v0, tile->uv.u0, tile->uv.v1,
        tile->uv.u1, tile->uv.v1);
    packet->clut = tile->uv.clut;
    packet->tpage = tile->uv.tpage | (shaders->uv.tpage & 0x1e00);
    GpuLinkPacketSized(ot + z, packet, sizeof(*packet));
    *cursor += sizeof(*packet);
}

static char* skid_name(int sample)
{
    return sample == 9 ? "tm3_s09" : "tm3_s27";
}

void Tm3UpdateSkidSound(Tm3WheelSurface* tracker, Car* car, const Rm4WheelContact* contact)
{
    const u8* rows = RegGetFileDataS("/world/wheelMaterials");
    const u8* row = contact ? rows + contact->material * 32 : NULL;
    int sample = row && row[10] ? row[9] : 0;
    SoundEmitter* sound
        = tracker->skid_sample ? SoundPlaying(car, skid_name(tracker->skid_sample)) : NULL;
    if (sample && sample != tracker->skid_sample && sound) {
        ObjectDestroy(sound);
        sound = NULL;
    }
    if (!sound)
        tracker->skid_sample = 0;
    if (sample) {
        int pitch = 1962 + (((int64_t)(contact->slip_speed_q12 - 0x400000) * 34 + 131072) >> 18);
        if (!sound) {
            Tm3PlayNamedSound(skid_name(sample), NULL, car, pitch, 0);
            sound = SoundPlaying(car, skid_name(sample));
            tracker->skid_volume = 255;
            tracker->skid_sample = sample;
        }
        tracker->skid_volume = 255;
        if (sound)
            for (int i = 0; i < sound->voice_count; ++i) {
                SoundEmitterVoice* v = &sound->voices[i];
                v->volume = v->volume_base;
                v->pitch_mode = SOUND_PITCH_FIXED;
                v->pitch = v->pitch_base = pitch;
            }
    } else if (sound) {
        tracker->skid_volume -= 32;
        if (tracker->skid_volume <= 0) {
            ObjectDestroy(sound);
            tracker->skid_sample = 0;
        } else
            for (int i = 0; i < sound->voice_count; ++i) {
                SoundEmitterVoice* v = &sound->voices[i];
                v->volume = v->volume_base * tracker->skid_volume / 255;
            }
    }
}

void Tm3ResetSkidSound(Tm3WheelSurface* tracker, Car* car)
{
    if (tracker->skid_sample) {
        SoundEmitter* sound = SoundPlaying(car, skid_name(tracker->skid_sample));
        if (sound)
            ObjectDestroy(sound);
    }
    tracker->skid_sample = tracker->skid_volume = 0;
}

int Tm3RegisterTireMarks(RegistryDirectory* directory)
{
    return ObjectRegisterClass(mark_class, sizeof(Tm3TireMark), directory,
        (Tm4PackedConstructor)mark_init, NULL, (Tm4ObjectCallback)mark_tick,
        (Tm4ObjectDisplayCallback)mark_draw, NULL);
}
