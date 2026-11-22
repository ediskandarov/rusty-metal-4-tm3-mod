#ifdef TM3_TEST_HOOKS
#include "../../tests/shared/teleport_appearance.h"
#endif
#include "assets.h"
#include "effects/private.h"
#include "flame.h"
#include "flash.h"
#include "surface.h"
#include "texture_bank.h"
#include "tm3/lightning.h"
#include "tm3/missile.h"
#include "tm4/main/object.h"
#include "turbo.h"

#include <stdlib.h>

const u8 *Tm3SpriteData, *Tm3WeaponData;
unsigned Tm3TextureBank;
Tm3WeaponGeometry Tm3WeaponMesh;
static unsigned references;

int Tm3ResourcesAcquire(void)
{
    if (references) {
        ++references;
        return 1;
    }
    RegistryDirectory* directory = RegGetDirectoryPtrS("/resourcePacks/tm3");
    if (!directory)
        return 0;
    Tm3SpriteData = RegGetFileDataPS(directory, "sprites");
    Tm3WeaponData = RegGetFileDataPS(directory, "weapons");
    const u8* bitmap = RegGetFileDataPS(directory, "graphics.bit");
    const u32* weapon_size = RegGetFileDataPS(directory, "weaponsSize");
    if (!Tm3SpriteData || !Tm3WeaponData || !bitmap || !weapon_size
        || !Tm3WeaponGeometryRead(&Tm3WeaponMesh, Tm3WeaponData, *weapon_size))
        return 0;
    u16* pixels = calloc(1024 * 512, sizeof(*pixels));
    if (!pixels)
        return 0;
    s32 x = Tm3ReadS16(bitmap), y = Tm3ReadS16(bitmap + 2), width = Tm3ReadS16(bitmap + 4),
        height = Tm3ReadS16(bitmap + 6);
    if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > 1024 || y + height > 512) {
        free(pixels);
        return 0;
    }
    for (s32 row = 0; row < height; ++row)
        memcpy(pixels + (y + row) * 1024 + x, bitmap + 8 + row * width * 2, width * 2);
    Tm3TextureBank = WebTextureBankCreate(pixels);
    free(pixels);
    if (!Tm3TextureBank)
        return 0;
    if (ObjectFindClassIndex("tm3Sprite") < 0) {
        if (!Tm3SpritesRegister(directory) || !Tm3ExplosionsRegister(directory)
            || !Tm3DebrisRegister(directory) || !Tm3ExplosionInteractionsRegister()
            || !Tm3SurfaceRegister(directory) || !Tm3FlamesRegister(directory)
            || !Tm3MissilesRegister(directory) || !Tm3LightningRegister(directory)
            || !Tm3FlashRegister(directory) || !Tm3TurboRegister(directory)
#ifdef TM3_TEST_HOOKS
            || !Tm3TestPortalRegister(directory)
#endif
        ) {
            WebTextureBankDestroy(Tm3TextureBank);
            Tm3TextureBank = 0;
            return 0;
        }
    }
    // SoundConstructor changes the resource arena; bind every contact sound before tick zero.
    static const u8 contact_samples[] = { 0, 6, 10, 16, 24 };
    for (unsigned i = 0; i < sizeof(contact_samples); ++i)
        if (!Tm3LoadSound(contact_samples[i])) {
            WebTextureBankDestroy(Tm3TextureBank);
            Tm3TextureBank = 0;
            return 0;
        }
    references = 1;
    return 1;
}
void Tm3ResourcesRelease(void)
{
    if (references && !--references) {
        WebTextureBankDestroy(Tm3TextureBank);
        Tm3TextureBank = 0;
        Tm3SpriteData = NULL;
        Tm3WeaponData = NULL;
        memset(&Tm3WeaponMesh, 0, sizeof(Tm3WeaponMesh));
    }
}
