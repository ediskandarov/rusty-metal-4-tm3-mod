#include "prop.h"
#include "tm3/missile.h"
#include "tm3/projectile_motion.h"
#include "tm3/resources.h"
#include "tm4/gpu_packet.h"
#include "tm4/main/game.h"
#include "tm4/main/geometry.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/os.h"
#include "tm4/main/render.h"
#include "tm4/modules/car_weapon.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

_Static_assert(sizeof(Tm3PropFace) == 52 && sizeof(Tm3PropResource) == 28, "TM3 type-23 record");
u32 Tm3PropSizeof = sizeof(Tm3Prop);
const SnapshotField Tm3PropFields[] = {
    SNAP_LOCAL(Tm3Prop, resource),
    SNAP_LOCAL(Tm3Prop, shaders),
    SNAP_LOCAL(Tm3Prop, behavior),
    SNAP_POD(Tm3Prop, transform.m),
    SNAP_POD(Tm3Prop, transform.t),
    SNAP_POD(Tm3Prop, velocity.vx),
    SNAP_POD(Tm3Prop, velocity.vy),
    SNAP_POD(Tm3Prop, velocity.vz),
    SNAP_POD(Tm3Prop, burst_offsets),
    SNAP_POD(Tm3Prop, burst_sizes),
    SNAP_POD(Tm3Prop, age),
    SNAP_POD(Tm3Prop, health),
    { 0 },
};

s32 Tm3PropInstanceConstructor(Tm3Prop* prop, RegistryDirectory* instance)
{
    const Tm3PropResource* resource = RegGetFileDataPS(instance, "mesh");
    const s32* count = RegGetFileDataS("/world/displayPolys/numPsxShaders");
    prop->shaders = RegGetFileDataS("/world/displayPolys/shaderData");
    if (!resource || !count || !prop->shaders || resource->motion > 2
        || (resource->motion == 2 && !resource->speed))
        return 0;
    for (unsigned i = 0; i < resource->faces; ++i)
        if (resource->mesh[i].shader >= (u32)*count)
            return 0;
    const char* behavior = RegGetFileDataPS(instance, "behavior");
    prop->behavior = behavior ? (const void*)OSSymbolGetAddress((char*)behavior) : NULL;
    if ((behavior && (!prop->behavior || strcmp(prop->behavior->name, behavior)))
        || (resource->motion && !prop->behavior))
        return 0;
    prop->resource = resource;
    memset(prop->burst_offsets, 0, sizeof(prop->burst_offsets));
    memset(prop->burst_sizes, 0, sizeof(prop->burst_sizes));
    prop->age = 0;
    prop->velocity = (SVECTOR) { 0 };
    prop->health = resource->health ? resource->health : 255;
    IdentifyMatrix(&prop->transform);
    prop->transform.t[0] = resource->origin.vx;
    prop->transform.t[1] = resource->origin.vy;
    prop->transform.t[2] = resource->origin.vz;
    ObjectSetPosition(prop, resource->origin.vx, resource->origin.vy, resource->origin.vz);
    if (prop->health != 255)
        ObjectSetInteractionRadius(prop, (resource->radius * 3 + 2) / 4);
    return 1;
}

/* Type-23 interactions in SCUS_942.49 at 8004b954, 8004b9d0 and 8004bac4. */
static int damage_prop(Tm3Prop* prop, void* projectile, unsigned damage)
{
    if (!prop->health || prop->health == 255)
        return 0;
    const Tm4ObjectHeader *a = ObjectGetHeader(prop), *b = ObjectGetHeader(projectile);
    VECTOR delta = { a->position.vx - b->position.vx, a->position.vy - b->position.vy,
        a->position.vz - b->position.vz, 0 };
    if (VectorLength0(&delta) >= a->interaction_radius)
        return 0;
    if (damage < (unsigned)prop->health) {
        prop->health -= damage;
        return 1;
    }
    prop->health = 0;
    prop->age = 0;
    const int span = a->interaction_radius > 0 ? a->interaction_radius * 2 : 1;
    for (int i = 0; i < 8; ++i) {
        prop->burst_offsets[i] = 512 - rand() % 1024;
        prop->burst_sizes[i] = span + span / 2 - rand() % span;
    }
    ObjectSetInteractionRadius(prop, 0);
    if (prop->behavior && prop->behavior->destroyed)
        prop->behavior->destroyed(prop, projectile);
    return 1;
}

void InteractBulletWithTm3Prop(void* bullet, void* prop)
{
    damage_prop(prop, bullet, 10);
}

void Tm3MissileHitsProp(void* object, void* prop)
{
    Tm3Missile* missile = object;
    if (!missile->linger && damage_prop(prop, missile, missile->damage))
        ObjectDestroy(missile);
}

/* The original destruction callback queues eight effects fifteen ticks apart. */
static void burst(Tm3Prop* prop)
{
    const unsigned i = prop->age / 15;
    if (!(prop->age % 15)) {
        SVECTOR p;
        ObjectCopyPosition(&p, prop);
        p.vx += prop->burst_offsets[i];
        p.vy += prop->burst_offsets[i];
        p.vz += prop->burst_offsets[i];
        Tm3SpawnSprite(0, &p, prop->burst_sizes[i], NULL, 12, -1);
        Tm3SpawnDebris(&p, 64);
        Tm3ExplosionSettings settings = { .position = p,
            .material = Tm3RemoteMaterial,
            .color = 0x202020,
            .height = 80,
            .inner_ratio_q12 = 1365,
            .speed = 384,
            .duration = 20,
            .radial_force = 2048,
            .lift = 2048,
            .affects_owner = 1,
            .once_per_car = 1 };
        Tm3SpawnExplosion(&settings);
    }
    if (++prop->age > 105)
        ObjectDestroy(prop);
}

void Tm3PropSpin(Tm3Prop* prop)
{
    const Tm3PropResource* r = prop->resource;
    if (r->spin[0])
        RotMatrixX(r->spin[0], &prop->transform);
    if (r->spin[1])
        RotMatrixY(r->spin[1], &prop->transform);
    if (r->spin[2])
        RotMatrixZ(r->spin[2], &prop->transform);
}

void Tm3PropProcess(Tm3Prop* prop)
{
    if (!prop->health) {
        burst(prop);
        return;
    }
    if (prop->behavior && prop->behavior->process)
        prop->behavior->process(prop);
    else
        Tm3PropSpin(prop);
    ++prop->age;
}

static void draw_mesh(const Tm3PropFace* faces, unsigned count, const Tm4CardQuadTexture* shaders,
    MATRIX* transform, Tm4OrderingTag* ordering, u8** cursor, u8* end, MATRIX* view)
{
    MATRIX camera;
    CompMatrix(view, transform, &camera);
    PushMatrix();
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    for (unsigned i = 0; i < count; ++i) {
        const Tm3PropFace* f = &faces[i];
        const int quad = (f->colors[0] >> 24) == 0x3c;
        const int n = quad ? 4 : 3;
        const size_t size = quad ? sizeof(POLY_GT4) : sizeof(POLY_GT3);
        if ((size_t)(end - *cursor) < size)
            break;
        u_long xy[4];
        int perspective, flags;
        s32 depth = RotTransPers((SVECTOR*)&f->vertices[0], (int*)&xy[0], &perspective, &flags);
        if (depth <= 0)
            continue;
        for (int v = 1; v < n; ++v)
            RotTransPers((SVECTOR*)&f->vertices[v], (int*)&xy[v], &perspective, &flags);
        if (!f->vertices[0].pad && Tm3ScreenClip(xy[0], xy[1], xy[2]) <= 0)
            continue;
        ClampOTDepth(depth);
        Tm4GouraudTexturedPacket* packet = (void*)*cursor;
        const Tm4CardQuadTexture* shader = shaders + f->shader;
        for (int v = 0; v < n; ++v) {
            packet->words.vertices[v].color = f->colors[v];
            packet->words.vertices[v].xy = xy[v];
        }
        packet->packed.uv0_clut.word = shader->packed.uv0_clut;
        packet->packed.uv1_page.word = shader->packed.uv1_page;
        packet->packed.uv2 = shader->packed.uv2;
        if (quad)
            packet->packed.uv3 = shader->packed.uv3;
        GpuLinkPacketSized(ordering + depth, &packet->quad, size);
        *cursor += size;
    }
    PopMatrix();
}

void Tm3PropDisplay(Tm3Prop* prop, Tm4OrderingTag* order, u8** cursor, u8* end, MATRIX* view)
{
    if (prop->health)
        draw_mesh(prop->resource->mesh, prop->resource->faces, prop->shaders, &prop->transform,
            order, cursor, end, view);
}

/* The first 56 bytes of the TM3 stage contain class 3's constructor arguments. */
typedef struct {
    u8 parameters[8], motion, effect, faces, frequency;
    u16 first_face, delay;
    SVECTOR origin;
    MATRIX target;
} TransitionResource;
_Static_assert(sizeof(TransitionResource) == 56, "TM3 transition resource");
u32 Tm3TransitionSizeof = sizeof(Tm3Transition);
const SnapshotField Tm3TransitionFields[] = {
    SNAP_POD(Tm3Transition, transform.m),
    SNAP_POD(Tm3Transition, transform.t),
    SNAP_POD(Tm3Transition, group),
    SNAP_POD(Tm3Transition, age),
    SNAP_POD(Tm3Transition, angular_speed),
    SNAP_POD(Tm3Transition, linear_speed),
    SNAP_POD(Tm3Transition, angle),
    SNAP_POD(Tm3Transition, moving),
    { 0 },
};

static RegistryDirectory* transition_directory(Tm3Transition* t)
{
    char path[80];
    snprintf(path, sizeof(path), "/objects/tm3Transition/instances/released/tm3_group_%u",
        (unsigned)t->group);
    return RegGetDirectoryPtrS(path);
}

s32 Tm3TransitionInstanceConstructor(Tm3Transition* t, RegistryDirectory* directory)
{
    const TransitionResource* r = RegGetFileDataPS(directory, "motion");
    const u32* id = RegGetFileDataPS(directory, "group");
    if (!r || !id || !r->faces || !RegGetFileDataPS(directory, "mesh"))
        return 0;
    memset(t, 0, sizeof(*t));
    t->group = *id;
    if (transition_directory(t) != directory)
        return 0;
    t->moving = r->motion;
    IdentifyMatrix(&t->transform);
    t->transform.t[0] = r->origin.vx;
    t->transform.t[1] = r->origin.vy;
    t->transform.t[2] = r->origin.vz;
    ObjectSetPosition(t, r->origin.vx, r->origin.vy, r->origin.vz);
    return 1;
}

/* SCUS_942.49 80034fdc: rotation and translation accelerate independently. */
void Tm3TransitionProcess(Tm3Transition* t)
{
    const TransitionResource* r = RegGetFileDataPS(transition_directory(t), "motion");
    if (!r) {
        ObjectDestroy(t);
        return;
    }
    if (++t->age <= r->delay)
        return;
    if (t->moving & 1) {
        s32 axis = (t->transform.m[2][2] * r->target.m[0][2]
                       - t->transform.m[0][2] * r->target.m[2][2] + 2048)
            >> 12;
        if (abs(axis) <= 512)
            t->moving &= ~1;
        else {
            RotMatrixY(axis < 0 ? -(s32)t->angle : t->angle, &t->transform);
            t->angle += (t->angular_speed + 2048) >> 12;
            if (t->angular_speed < 0x80000)
                t->angular_speed += 1024;
        }
    }
    if (t->moving & 2) {
        s32 step = (t->linear_speed + 2048) >> 12;
        u32 distance2 = 0;
        for (s32 axis = 0; axis < 3; ++axis) {
            s32 delta = r->target.t[axis] - t->transform.t[axis];
            distance2 += (u32)delta * delta;
            t->transform.t[axis] += delta < -step ? -step : delta > step ? step : delta;
        }
        t->linear_speed += 2048;
        if (t->linear_speed > 0x44444)
            t->linear_speed = 0x44444;
        ObjectSetPosition(t, t->transform.t[0], t->transform.t[1], t->transform.t[2]);
        if (distance2 < 32 * 32)
            t->moving &= ~2;
    }
    if (!t->moving)
        ObjectDestroy(t);
}
void Tm3TransitionDisplay(
    Tm3Transition* t, Tm4OrderingTag* order, u8** cursor, u8* end, MATRIX* view)
{
    RegistryDirectory* directory = transition_directory(t);
    const TransitionResource* r = RegGetFileDataPS(directory, "motion");
    const Tm3PropFace* faces = RegGetFileDataPS(directory, "mesh");
    const Tm4CardQuadTexture* shaders = RegGetFileDataS("/world/displayPolys/shaderData");
    if (r && faces && shaders)
        draw_mesh(faces, r->faces, shaders, &t->transform, order, cursor, end, view);
}
