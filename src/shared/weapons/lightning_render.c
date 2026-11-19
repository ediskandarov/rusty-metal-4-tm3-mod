#include "assets.h"
#include "effects/billboard.h"
#include "tm4/main/math3d.h"

void Tm3DrawOutlawEmitter(int angle, int frame, const SVECTOR* position, Tm4OrderingTag* ordering,
    u8** cursor, u8* limit, MATRIX* view)
{
    Tm3DrawOrientedBillboard(
        angle, 200, 4, frame, 160, 160, 0x808080, position, ordering, cursor, limit, view);
}

void Tm3DrawOutlawBolt(const MATRIX* transform, const s16 points[][3], int count,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    u32 offset = Tm3ReadU32(Tm3WeaponData + 0x188);
    if (offset > Tm3WeaponMesh.material_bytes
        || Tm3WeaponMesh.material_bytes - offset < sizeof(Tm4CardQuadTexture))
        return;
    Tm4CardQuadTexture texture;
    Tm3CopyTexture(&texture, Tm3WeaponMesh.materials + offset);
    MATRIX camera;
    CompMatrix(view, (MATRIX*)transform, &camera);
    PushMatrix();
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    for (int i = 1; i < count; ++i) {
        const s16 *a = points[i - 1], *b = points[i];
        SVECTOR vertices[4]
            = { { a[0], a[1], a[2], 0 }, { a[0] + (i == 1 ? 0 : 32), a[1], a[2], 0 },
                  { b[0], b[1], b[2], 0 }, { b[0] + 32, b[1], b[2], 0 } };
        CardDisplayTexturedQuad(
            vertices, 0x808080, &texture, ordering, (Tm4CardPacket**)cursor, 1, limit, 200);
    }
    PopMatrix();
}
