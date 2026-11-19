#ifndef TM3_SHARED_ASSETS_H
#define TM3_SHARED_ASSETS_H
#include "tm3/resources.h"

#include <string.h>

extern const u8 *Tm3SpriteData, *Tm3WeaponData;
extern unsigned Tm3TextureBank;
extern Tm3WeaponGeometry Tm3WeaponMesh;

static inline s32 Tm3ReadS16(const void* p)
{
    s16 v;
    memcpy(&v, p, 2);
    return v;
}
static inline u32 Tm3ReadU32(const void* p)
{
    u32 v;
    memcpy(&v, p, 4);
    return v;
}
static inline void Tm3CopyTexture(Tm4CardQuadTexture* texture, const void* source)
{
    memcpy(texture, source, sizeof(*texture));
    texture->uv.tpage |= Tm3TextureBank << 9;
}
#endif
