#include "assets.h"
#include "tm4/main/math3d.h"

void Tm3DisplayEnergyMissile(MATRIX* transform, Tm3EnergyVisual visual, unsigned age,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    u32 offset = Tm3ReadU32(Tm3WeaponData + 0x50);
    if (offset > Tm3WeaponMesh.material_bytes
        || Tm3WeaponMesh.material_bytes - offset < sizeof(Tm4CardQuadTexture))
        return;
    Tm4CardQuadTexture front, beam;
    Tm3CopyTexture(&front, Tm3WeaponMesh.materials + offset);
    if (visual == Tm3RainDropVisual) {
        unsigned count = Tm3ReadS16(Tm3WeaponData + 0x138);
        if (!count || count > (0x388 - 0x140) / 4)
            return;
        u32 material = Tm3ReadU32(Tm3WeaponData + 0x140 + 4 * ((age / 2) % count));
        if (material > Tm3WeaponMesh.material_bytes
            || Tm3WeaponMesh.material_bytes - material < sizeof(beam))
            return;
        Tm3CopyTexture(&beam, Tm3WeaponMesh.materials + material);
    } else {
        unsigned frame = visual == Tm3NapalmVisual ? (age / 2) % Tm3SpriteFrameCount(3) : 0;
        Tm3CopyTexture(
            &beam, Tm3SpriteData + 628 + Tm3ReadU32(Tm3SpriteData + 3 * 104 + 8 + 4 * frame));
    }
    const u32 tint = visual != Tm3FreezeVisual ? 0x808080 : 0xa00000;
    s16 w = Tm3ReadS16(Tm3WeaponData + 0x4a) / 2, h = Tm3ReadS16(Tm3WeaponData + 0x4c) / 2;
    SVECTOR head[4] = {
        { -w, -h },
        { w, -h },
        { -w, h },
        { w, h },
    };
    SVECTOR flat[4] = {
        { -70, 0, -400 },
        { 70, 0, -400 },
        { -70, 0, 0 },
        { 70, 0, 0 },
    };
    SVECTOR upright[4] = {
        { 0, 70, -400 },
        { 0, -70, -400 },
        { 0, 70, 0 },
        { 0, -70, 0 },
    };
    MATRIX camera, billboard;
    CompMatrix(view, transform, &camera);
    RotationMatrixY(0, &billboard);
    memcpy(billboard.t, camera.t, sizeof(billboard.t));
    PushMatrix();
    SetRotMatrix(&billboard);
    SetTransMatrix(&billboard);
    CardDisplayTexturedQuad(head, tint, &front, ordering, (Tm4CardPacket**)cursor, 1, limit, 96);
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    CardDisplayTexturedQuad(flat, tint, &beam, ordering, (Tm4CardPacket**)cursor, 1, limit, 64);
    CardDisplayTexturedQuad(upright, tint, &beam, ordering, (Tm4CardPacket**)cursor, 1, limit, 64);
    PopMatrix();
}
