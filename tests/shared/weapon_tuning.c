#include "tm3/weapon_tuning.h"
#include "projectile_cases.h"
#include <assert.h>
#include <stddef.h>
#include <stdint.h>

int main(void)
{
    for (int profile = 0; profile < 24; ++profile) {
        const Tm3ProjectileTuning* tuning = test_tuning(profile);
        if ((profile >= 9 && profile <= 13) || profile == 16) {
            assert(!tuning);
            continue;
        }
        assert(tuning && tuning->speed > 0);
        assert(tuning->omnidirectional_homing <= 1);
        assert(tuning->effect <= 3);
        assert(tuning->launch_offset[0] == 0 && tuning->launch_offset[2] == 0);
        if (profile != 5)
            assert(Tm3WeaponTimeTicks(tuning->lifetime_q12) >= 60);
    }
    assert(test_tuning(-1) == NULL && test_tuning(24) == NULL);
    const Tm3ProjectileTuning* spectre = test_tuning(15);
    assert(spectre->damage == 400 && spectre->speed == 5000 && spectre->steering == 2400);
    assert(spectre->omnidirectional_homing == 1 && spectre->initial_deviation == 180);
    const Tm3ProjectileTuning* flower = test_tuning(21);
    assert(flower->speed == 4000 && flower->launch_offset[1] == -512 && flower->effect == 0);
    assert(Tm3WeaponTimeTicks(test_tuning(20)->lifetime_q12) == 73);
    assert(test_tuning(18)->steering == 0);
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
    assert(!Tm3WorldProjectile(14) && !Tm3WorldProjectile(21));
    assert(test_projectile(15)->collide_world == 0);
    assert(test_projectile(21)->collide_world == 1);
    assert(test_projectile(17)->impact && !test_projectile(17)->apply_impulse);
    assert(test_projectile(14)->damage_at_age == Tm3WarthogDamage);
    return 0;
}
