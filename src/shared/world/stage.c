#include "stage.h"
#include "mod_api.h"
#include "src/modules/frag/private.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/system.h"
#include "tm4/main/world.h"
#include <STDARG.H>
#include <stdio.h>
#include <stdlib.h>

extern s32 WorldSetDisplayFaces(Tm4WorldInfoBundle* world, s32 enabled);
static char hide_class[] = "tm3StageHide";

static s32 construct(Tm3StageHide* hide, va_list arguments)
{
    hide->group = va_arg(arguments, int);
    hide->stage = va_arg(arguments, int);
    hide->tick = GetCurrentTime();
    return 1;
}

static void process(Tm3StageHide* hide)
{
    if (hide->tick == GetCurrentTime())
        return;
    char path[80];
    snprintf(
        path, sizeof(path), "/objects/destroyable/instances/startup/tm3_group_%d", hide->group);
    RegistryDirectory* stage = RegGetDirectoryPtrS(path);
    for (int i = 0; stage && i < hide->stage; ++i)
        stage = RegGetDirectoryPtrPS(stage, "next");
    if (stage)
        WorldSetDisplayFaces(WorldObjectGetInfo(stage), 0);
    ObjectDestroy(hide);
}

int Tm3StageRegister(RegistryDirectory* directory)
{
    return ObjectRegisterClass(hide_class, sizeof(Tm3StageHide), directory,
        (Tm4PackedConstructor)construct, NULL, (Tm4ObjectCallback)process, NULL, NULL);
}

void Tm3StageEffect(RegistryDirectory* stage, s32 x, s32 y, s32 z)
{
    const s32* refs = RegGetFileDataPS(stage, "fragmentFaces");
    SVECTOR origin = { x, y, z, 0 };
    if (refs) {
        u8* faces = RegGetFileDataS("/world/displayPolys/faceData");
        const SVECTOR* vertices = RegGetFileDataS("/world/displayPolys/vertexData");
        const s32* id = RegGetFileDataPS(stage, "stageId");
        if (ObjectCreate(hide_class, 0, id[0], id[1]))
            WorldSetDisplayFaces(WorldObjectGetInfo(stage), 1);
        for (s32 remaining = *refs++; remaining; --remaining) {
            Tm4DisplayFace* face = (void*)(faces + *refs++);
            const SVECTOR* base = vertices + *refs++;
            u8 ids[4];
            int count = WorldGetFaceVertexIndices(face, &ids[0], &ids[1], &ids[2], &ids[3]);
            if (!count)
                continue;
            VECTOR sum = { 0 };
            for (int i = 0; i < count; ++i) {
                sum.vx += base[ids[i]].vx;
                sum.vy += base[ids[i]].vy;
                sum.vz += base[ids[i]].vz;
            }
            SVECTOR center = { sum.vx / count, sum.vy / count, sum.vz / count, 0 };
            int32_t outward[3] = { center.vx - x, -8 * abs(center.vy - y), center.vz - z };
            int16_t direction[3];
            Tm3ProjectileNormalize(outward, direction);
            VECTOR velocity = { 0 };
            velocity.vx = direction[0] * (768 + rand() % 1536);
            velocity.vy = direction[1] * (768 + rand() % 1536);
            velocity.vz = direction[2] * (768 + rand() % 1536);
            Fragment* shard = ObjectCreate("fragment", 0, face, base, &center, &velocity, NULL);
            if (shard) {
                // Class 14 rotates about the vertex centroid (800124bc).
                /* 8001e578 and 80036d90: original gravity at two rounded 30 Hz steps. */
                const s32 tm3Gravity = 1888, secondsQ18 = 8738;
                s32 frameGravity = ((int64_t)(tm3Gravity << 12) * secondsQ18 + (1 << 17)) >> 18;
                shard->gravity_step_q12 = ((int64_t)frameGravity * secondsQ18 + (1 << 17)) >> 18;
                shard->radius = 0;
                for (int i = 0; i < count; ++i) {
                    SVECTOR* v = &shard->local_vertices[i];
                    v->vx = base[ids[i]].vx - center.vx;
                    v->vy = base[ids[i]].vy - center.vy;
                    v->vz = base[ids[i]].vz - center.vz;
                    s32 r = SquareRoot0(v->vx * v->vx + v->vy * v->vy + v->vz * v->vz);
                    if (r > shard->radius)
                        shard->radius = r;
                }
            }
        }
    }
    Tm3SpawnSprite(0, &origin, 500, NULL, 12, -1);
}

void Tm3FragmentImpact(const SVECTOR* point, s32 size, s32 surface)
{
    if (rand() % 3 == 0)
        Tm3SpawnSurfaceSprite(0, point, size, NULL, 12, rand() & 1 ? -2 : -1, surface);
    if (!(rand() & 3)) {
        SVECTOR smoke = *point;
        smoke.vy -= size / 2;
        Tm3SpawnSurfaceSprite(2, &smoke, size, NULL, 12, -2, surface);
    }
}
