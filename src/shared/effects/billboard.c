#include "effects/billboard.h"
#include "assets.h"
#include "tm4/main/math3d.h"
#include "tm4/main/render.h"

int Tm3SpriteFrameCount(int id)
{
    return Tm3ReadS16(Tm3SpriteData + id * 104);
}
void Tm3DrawOrientedBillboard(int angle, int depth_bias, int id, int frame, int width, int height,
    u32 color, const SVECTOR* position, Tm4OrderingTag* ordering, u8** cursor, u8* limit,
    MATRIX* view)
{
    const u8* profile = Tm3SpriteData + id * 104;
    if (frame < 0 || frame >= Tm3ReadS16(profile))
        return;
    Tm4CardQuadTexture texture;
    Tm3CopyTexture(&texture, Tm3SpriteData + 628 + Tm3ReadU32(profile + 8 + frame * 4));
    PushMatrix();
    SetRotMatrix(view);
    SetTransMatrix(view);
    MATRIX billboard;
    VECTOR camera;
    Tm4GteFlag flags;
    RotTrans((SVECTOR*)position, &camera, &flags);
    RotationMatrixY(0, &billboard);
    if (angle)
        RotMatrixZ(angle, &billboard);
    billboard.t[0] = camera.vx;
    billboard.t[1] = camera.vy;
    billboard.t[2] = camera.vz;
    SetRotMatrix(&billboard);
    SetTransMatrix(&billboard);
    s32 x = width / 2, y = height / 2;
    SVECTOR vertices[4] = { { -x, -y, 0, 0 }, { x, -y, 0, 0 }, { -x, y, 0, 0 }, { x, y, 0, 0 } };
    CardDisplayTexturedQuad(
        vertices, color, &texture, ordering, (Tm4CardPacket**)cursor, 1, limit, depth_bias);
    PopMatrix();
}
void Tm3DrawBillboard(int id, int frame, int size, u32 color, const SVECTOR* position,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    Tm3DrawOrientedBillboard(
        0, 96, id, frame, size, size, color, position, ordering, cursor, limit, view);
}

void Tm3DrawFire(int frame, int width, int height, const SVECTOR* center, Tm4OrderingTag* ordering,
    u8** cursor, u8* limit, MATRIX* view)
{
    SVECTOR p = *center;
    p.vy -= height / 2;
    Tm3DrawOrientedBillboard(
        0, 96, 3, frame, width, height, 0x303030, &p, ordering, cursor, limit, view);
}
