#include "tm3/world.h"

const SVECTOR* Tm3WorldMarker(unsigned kind)
{
    const SVECTOR* markers = RegGetFileDataS("/world/tm3WeaponMarkers");
    if (!markers || RegGetFileArraySizeS("/world/tm3WeaponMarkers") != 128)
        return NULL;
    for (unsigned i = 0; i < 128 && (markers[i].pad & 255); ++i)
        if ((markers[i].pad & 255) == kind)
            return &markers[i];
    return NULL;
}
