#include "tm4/main/game.h"
#include "tm4/modules/car.h"

/* Resolve a participant after restore; placement helpers retain no live identity. */
s32 Tm3TestCarEffectState(s32 slot, s32 field)
{
    if (slot < 0 || (u32)slot >= sizeof(GameInfo.players) / sizeof(GameInfo.players[0])
        || !GameInfo.players[slot].car)
        return -1;
    Car* car = GameInfo.players[slot].car;
    switch (field) {
    case 0:
        return car->freeze_ticks;
    case 1:
        return car->invisibility_ticks;
    case 2:
        return car->original_faces != NULL;
    case 3:
        return car->original_colors != NULL;
    case 4:
        return car->freeze_sound != NULL;
    case 5:
        return car->invisibility_sound != NULL;
    case 6:
        return (car->freeze_effect.resource != NULL)
            | ((car->invisibility_effect.resource != NULL) << 1);
    default:
        return -1;
    }
}
