#include "projectile.h"

uint16_t Tm3WarthogDamage(uint32_t age)
{
    const Tm3ProjectileTuning* tuning = &Tm3ProjectileType_Warthog.tuning;
    uint32_t product = (uint32_t)(int32_t)tuning->damage * (age << 12);
    uint32_t lifetime = (tuning->lifetime_q12 * 30u + 2048u) >> 12;
    uint32_t ramp = product / lifetime;
    return (uint16_t)((uint16_t)tuning->damage + ((ramp + 2048u) >> 12));
}
