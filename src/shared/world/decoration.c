#include "decoration.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/system.h"
#include <stddef.h>

typedef struct {
    u32 header;
    SVECTOR center, vertices[4];
    s16 blend;
    u8 mode, spin;
    u32 color, shader;
} Quad;
_Static_assert(sizeof(Quad) == 56 && offsetof(Quad, shader) == 52, "TM3 type-11 layout");

u32 Tm3DecorationSizeof = sizeof(Tm3Decoration);
const SnapshotField Tm3DecorationFields[] = {
    SNAP_LOCAL(Tm3Decoration, quad),
    SNAP_LOCAL(Tm3Decoration, texture),
    SNAP_LOCAL(Tm3Decoration, width),
    SNAP_LOCAL(Tm3Decoration, height),
    { 0 },
};

static s32 edge_length(const SVECTOR* a, const SVECTOR* b)
{
    s32 x = b->vx - a->vx, y = b->vy - a->vy, z = b->vz - a->vz;
    return SquareRoot0(x * x + y * y + z * z);
}

s32 Tm3DecorationInstanceConstructor(Tm3Decoration* decoration, RegistryDirectory* directory)
{
    const Quad* quad = RegGetFileDataPS(directory, "quad");
    const s32* count = RegGetFileDataS("/world/displayPolys/numPsxShaders");
    Tm4CardQuadTexture* shaders = RegGetFileDataS("/world/displayPolys/shaderData");
    if (!quad || !count || !shaders || quad->shader >= (u32)*count)
        return 0;
    decoration->quad = quad;
    decoration->texture = &shaders[quad->shader];
    decoration->width = edge_length(&quad->vertices[0], &quad->vertices[1]);
    decoration->height = edge_length(&quad->vertices[0], &quad->vertices[2]);
    ObjectSetPosition(decoration, quad->center.vx, quad->center.vy, quad->center.vz);
    return 1;
}

void Tm3DecorationDisplay(
    Tm3Decoration* decoration, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    const Quad* quad = decoration->quad;
    SVECTOR corners[4];
    SVECTOR* vertices = (SVECTOR*)quad->vertices;
    PushMatrix();
    SetRotMatrix(view);
    SetTransMatrix(view);
    if (quad->mode != 2) {
        MATRIX billboard;
        VECTOR camera;
        Tm4GteFlag flags;
        RotTrans((SVECTOR*)&quad->center, &camera, &flags);
        RotationMatrixY(0, &billboard);
        if (quad->mode == 1)
            RotMatrixZ(((u32)GetCurrentTime() * quad->spin) & 4095, &billboard);
        billboard.t[0] = camera.vx;
        billboard.t[1] = camera.vy;
        billboard.t[2] = camera.vz;
        SetRotMatrix(&billboard);
        SetTransMatrix(&billboard);
        s32 x = decoration->width / 2, y = decoration->height / 2;
        corners[0] = (SVECTOR) { -x, -y, 0, 0 };
        corners[1] = (SVECTOR) { x, -y, 0, 0 };
        corners[2] = (SVECTOR) { -x, y, 0, 0 };
        corners[3] = (SVECTOR) { x, y, 0, 0 };
        vertices = corners;
    }
    CardDisplayTexturedQuad(vertices, quad->color, decoration->texture, ordering,
        (Tm4CardPacket**)cursor, quad->blend, limit, 0);
    PopMatrix();
}
