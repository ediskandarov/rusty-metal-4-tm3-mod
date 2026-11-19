#include "tm3/lightning.h"

/* Original fixed emitters use no car owner, and scan markers until the first zero. */
int Tm3MapLightning(unsigned marker)
{
    const SVECTOR* anchors = RegGetFileDataS("/world/tm3WeaponMarkers");
    if (!anchors || RegGetFileArraySizeS("/world/tm3WeaponMarkers") != 128)
        return 0;
    int created = 0;
    for (unsigned i = 0; i < 128 && (anchors[i].pad & 255); ++i) {
        if ((anchors[i].pad & 255) != marker)
            continue;
        const Tm3LightningSettings settings = {
            .position = anchors[i],
            .flash = 1,
            .duration = 90,
            .range = marker == 5 ? 6144
                : marker == 3    ? 8192
                                 : 2048,
            .force = marker == 5 ? -2097152 : -6291456,
            .damage = marker == 5 ? 20 : 10,
            .sound = "tm3_s26",
            .pitch = 0x51c,
        };
        if (Tm3SpawnLightning(&settings))
            created = 1;
    }
    return created;
}
