#include "stage.h"
#include "tm4/main/object.h"
#include "tm4/main/world.h"
#include <stdlib.h>

void Tm3StageEffect(RegistryDirectory* stage, s32 x, s32 y, s32 z)
{
    const s32* refs = RegGetFileDataPS(stage, "fragmentFaces");
    SVECTOR origin = { x, y, z, 0 };
    if (refs) {
        u8* faces = RegGetFileDataS("/world/displayPolys/faceData");
        const SVECTOR* vertices = RegGetFileDataS("/world/displayPolys/vertexData");
        for (s32 remaining = *refs++; remaining; --remaining) {
            Tm4DisplayFace* face = (void*)(faces + *refs++);
            const SVECTOR* base = vertices + *refs++;
            SVECTOR center;
            WorldGetFaceCenterPoint(face, base, &center);
            int32_t outward[3] = { center.vx - x, -8 * abs(center.vy - y), center.vz - z };
            int16_t direction[3];
            Tm3ProjectileNormalize(outward, direction);
            VECTOR velocity = { 0 };
            velocity.vx = direction[0] * (768 + rand() % 1536);
            velocity.vy = direction[1] * (768 + rand() % 1536);
            velocity.vz = direction[2] * (768 + rand() % 1536);
            ObjectCreate("fragment", 0, face, base, &center, &velocity, NULL);
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
