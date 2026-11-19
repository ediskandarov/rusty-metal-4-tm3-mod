#include "tm3/weapon_tuning.h"

/* Constructor 8002d934 and weapon initialization 80033a50 use 32-bit unsigned
   multiplication/addition, including wrapping before the logical shift. */
uint32_t Tm3WeaponTimeTicks(uint32_t seconds_q12)
{
    return (seconds_q12 * 30u + 2048u) >> 12;
}
