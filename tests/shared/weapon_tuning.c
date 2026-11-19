#include "tm3/weapon_tuning.h"
#include <assert.h>
#include <stddef.h>
#include <stdint.h>

int main(void)
{
    for (int profile = 0; profile < 24; ++profile) {
        const Tm3ProjectileTuning* tuning = Tm3ProjectileDefaults(profile);
        assert(tuning && tuning->speed > 0);
        assert(tuning->omnidirectional_homing <= 1);
        assert(tuning->effect <= 3);
        assert(tuning->launch_offset[0] == 0 && tuning->launch_offset[2] == 0);
        if (profile != 5)
            assert(Tm3WeaponTimeTicks(tuning->lifetime_q12) >= 60);
    }
    assert(Tm3ProjectileDefaults(-1) == NULL && Tm3ProjectileDefaults(24) == NULL);
    const Tm3ProjectileTuning* spectre = Tm3ProjectileDefaults(15);
    assert(spectre->damage == 400 && spectre->speed == 5000 && spectre->steering == 2400);
    assert(spectre->omnidirectional_homing == 1 && spectre->initial_deviation == 180);
    const Tm3ProjectileTuning* flower = Tm3ProjectileDefaults(21);
    assert(flower->speed == 4000 && flower->launch_offset[1] == -512 && flower->effect == 0);
    assert(Tm3WeaponTimeTicks(Tm3ProjectileDefaults(20)->lifetime_q12) == 73);
    assert(Tm3ProjectileDefaults(18)->steering == 0);
    const uint32_t seconds[16] = { 45, 60, 50, 45, 30, 60, 35, 30, 45, 45, 45, 60, 60, 60, 60, 60 };
    const uint32_t maximum[16] = { 3, 5, 5, 4, 5, 3, 4, 5, 5, 5, 5, 5, 4, 5, 5, 5 };
    for (int car = 0; car < 16; ++car) {
        const Tm3SpecialTuning* tuning = Tm3SpecialDefaults(car);
        assert(tuning && tuning->initial_ammo == 2 && tuning->maximum_ammo == maximum[car]);
        assert(Tm3WeaponTimeTicks(tuning->regeneration_q12) == seconds[car] * 30);
    }
    assert(Tm3SpecialDefaults((Tm3CarId)-1) == NULL);
    assert(Tm3SpecialDefaults((Tm3CarId)16) == NULL);
    assert(Tm3WeaponTimeTicks(0) == 0 && Tm3WeaponTimeTicks(4096) == 30);
    assert(Tm3WeaponTimeTicks(UINT32_MAX) == 0);
    assert(Tm3WarthogDamage(0) == 130);
    assert(Tm3WarthogDamage(1) == 132);
    assert(Tm3WarthogDamage(30) == 195);
    assert(Tm3WarthogDamage(60) == 260);
    assert(Tm3WarthogDamage(61) == 262);
    /* Preserve original word overflow and unsigned division, not a saturating ramp. */
    const uint32_t ages[] = { 0, 1, 60, 61, 8192, 65535, 1000000, UINT32_MAX };
    for (unsigned i = 0; i < sizeof(ages) / sizeof(ages[0]); ++i) {
        uint64_t shifted = ((uint64_t)ages[i] * 4096) & UINT32_MAX;
        uint64_t product = (130 * shifted) & UINT32_MAX;
        uint64_t rounded = ((product / 60) + 2048) & UINT32_MAX;
        assert(Tm3WarthogDamage(ages[i]) == (uint16_t)(130 + rounded / 4096));
    }
    return 0;
}
