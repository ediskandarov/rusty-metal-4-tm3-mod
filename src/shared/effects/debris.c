#include "effects/private.h"
#include "tm4/gpu_packet.h"
#include "tm4/main/math3d.h"
#include "tm4/main/render.h"
#include "tm4/main/world.h"

#include <STDARG.H>
#include <stdlib.h>
#include <string.h>

static char debris_class[] = "tm3Debris";

/* TM3 class 5, 80027c90/80027df8: twelve rotating fragments, removed at ground height. */
static s32 debris_constructor(Tm3Debris* debris, va_list arguments)
{
    const SVECTOR* origin = va_arg(arguments, const SVECTOR*);
    memset(debris, 0, sizeof(*debris));
    debris->size = va_arg(arguments, int);
    debris->color = 36;
    debris->floor = (u16)(WorldGetHeight(origin->vx, origin->vz) + 32);
    set_position(debris, origin);
    for (s32 i = 0; i < 12; ++i) {
        Tm3DebrisParticle* particle = &debris->particles[i];
        particle->position[0] = origin->vx;
        particle->position[1] = origin->vy;
        particle->position[2] = origin->vz;
        s32 x = rand(), y = rand(), z = rand();
        x = (s16)((x << 15) | x);
        z = (s16)((z << 15) | z);
        particle->velocity[0] = x * 2;
        particle->velocity[1] = -(s16)y;
        particle->velocity[2] = z * 2;
        particle->spin = z % 16;
    }
    return 1;
}
static void debris_process(Tm3Debris* debris)
{
    s32 active = 0;
    for (s32 i = 0; i < 12; ++i) {
        Tm3DebrisParticle* particle = &debris->particles[i];
        if (particle->position[1] > (s32)debris->floor)
            continue;
        ++active;
        particle->velocity[1] += 1888;
        for (s32 axis = 0; axis < 3; ++axis)
            particle->position[axis] += (particle->velocity[axis] + 512) >> 10;
        particle->angle = (s16)(particle->angle + particle->spin);
    }
    if (!active)
        ObjectDestroy(debris);
}
static void debris_display(
    Tm3Debris* debris, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    if (*cursor + 12 * sizeof(POLY_F3) >= limit)
        return;
    PushMatrix();
    for (s32 i = 0; i < 12; ++i) {
        const Tm3DebrisParticle* particle = &debris->particles[i];
        MATRIX transform, camera;
        RotationMatrixY(particle->angle, &transform);
        RotMatrixZ(particle->angle, &transform);
        for (s32 axis = 0; axis < 3; ++axis)
            transform.t[axis] = particle->position[axis];
        CompMatrix(view, &transform, &camera);
        SetRotMatrix(&camera);
        SetTransMatrix(&camera);
        s32 half = debris->size / 2;
        SVECTOR vertices[3]
            = { { -half, -half, 0, 0 }, { half, -half, 0, 0 }, { -half, half, 0, 0 } };
        int xy[3], perspective, flags;
        s32 depth = RotTransPers3(
            &vertices[0], &vertices[1], &vertices[2], &xy[0], &xy[1], &xy[2], &perspective, &flags);
        if (depth <= 20 || depth >= (s32)otSize)
            continue;
        POLY_F3* packet = (void*)*cursor;
        setPolyF3(packet);
        setRGB0(
            packet, debris->color & 255, (debris->color >> 8) & 255, (debris->color >> 16) & 255);
        setXY3(packet, (s16)xy[0], (s16)(xy[0] >> 16), (s16)xy[1], (s16)(xy[1] >> 16), (s16)xy[2],
            (s16)(xy[2] >> 16));
        GpuLinkPacketSized(ordering + depth, packet, sizeof(*packet));
        *cursor += sizeof(*packet);
    }
    PopMatrix();
}
void Tm3SpawnBurstParticles(const SVECTOR* position)
{
    Tm3SpawnSprite(0, position, 1200, NULL, 12, -1);
    SVECTOR stationary = { 0 };
    Tm3SpawnSprite(1, position, 1200, &stationary, 12, -1);
    Tm3SpawnDebris(position, 32);
}
void Tm3SpawnDebris(const SVECTOR* position, s32 size)
{
    ObjectCreate(debris_class, 0, position, size);
}

int Tm3DebrisRegister(RegistryDirectory* directory)
{
    return ObjectRegisterClass(debris_class, sizeof(Tm3Debris), directory,
        (Tm4PackedConstructor)debris_constructor, NULL, (Tm4ObjectCallback)debris_process,
        (Tm4ObjectDisplayCallback)debris_display, NULL);
}
const SnapshotField Tm3DebrisFields[] = { { SnapshotPod, 0, sizeof(Tm3Debris), NULL }, { 0 } };
