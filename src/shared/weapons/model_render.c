#include "assets.h"

void Tm3DisplayWeaponGroup(u32 descriptor, u32 variant, s32 tint, const MATRIX* local_to_world,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    Tm3DisplayWeaponGeometry(&Tm3WeaponMesh, descriptor, variant, Tm3TextureBank, tint,
        local_to_world, ordering, cursor, limit, view);
}

int Tm3WeaponAnimationTexture(u32 header, int frame, Tm4CardQuadTexture* texture)
{
    if (header > 0x388 - 8 || frame < 0 || frame >= Tm3ReadS16(Tm3WeaponData + header)
        || (u32)frame >= (0x388 - header - 8) / 4)
        return 0;
    u32 offset = Tm3ReadU32(Tm3WeaponData + header + 8 + frame * 4);
    if (offset > Tm3WeaponMesh.material_bytes
        || Tm3WeaponMesh.material_bytes - offset < sizeof(*texture))
        return 0;
    Tm3CopyTexture(texture, Tm3WeaponMesh.materials + offset);
    return 1;
}
