#include "module_import.h"
#include "special.h"
#include "tm4/main/math3d.h"

/* TM3 80031048: a billboard at the tip and two intersecting quads along the missile. */
void Tm3DrawThumperSegment(MATRIX* transform, int frame, int age, Tm4OrderingTag* ordering,
    u8** cursor, u8* limit, MATRIX* view)
{
    Tm4CardQuadTexture texture;
    if (!WEB_MODULE("mtm3fx.sym", Tm3WeaponAnimationTexture)(0x118, frame, &texture))
        return;
    s16 half = (100 + 32 * age) / 2;
    SVECTOR vertices[4]
        = { { -half, -20, 0, 0 }, { half, -20, 0, 0 }, { -half, 20, 0, 0 }, { half, 20, 0, 0 } };
    MATRIX camera;
    CompMatrix(view, transform, &camera);
    PushMatrix();
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    CardDisplayTexturedQuad(vertices, 0x404040 - 0x040404 * age, &texture, ordering,
        (Tm4CardPacket**)cursor, 1, limit, 64);
    PopMatrix();
}
