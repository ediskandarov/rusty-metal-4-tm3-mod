#include "tm3/lightning.h"

/* Original fixed emitters use no car owner, and scan markers until the first zero. */
int Tm3MarkerLightning(unsigned marker, const Tm3LightningSettings* defaults)
{
    const SVECTOR* anchors = RegGetFileDataS("/world/tm3WeaponMarkers");
    if (!anchors || RegGetFileArraySizeS("/world/tm3WeaponMarkers") != 128)
        return 0;
    int created = 0;
    for (unsigned i = 0; i < 128 && (anchors[i].pad & 255); ++i) {
        if ((anchors[i].pad & 255) != marker)
            continue;
        Tm3LightningSettings settings = *defaults;
        settings.position = anchors[i];
        settings.flash = 0;
        if (Tm3SpawnLightning(&settings))
            created = 1;
    }
    if (created && defaults->flash)
        Tm3FlashStart(1, defaults->duration + 1);
    return created;
}
