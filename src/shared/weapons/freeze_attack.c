#include "freeze_attack.h"
#include "module_import.h"
#include "tm3/missile.h"

void* CarPrepareProjectileLaunch(Car*, CarWeaponInstance*, s32, MATRIX*, SVECTOR*);

s32 Tm3LaunchFreeze(Car* car, void* unused, CarWeaponInstance* weapon, s32 rear)
{
    (void)unused;
    MATRIX transform;
    SVECTOR inherited;
    Car* target
        = WEB_MODULE("car", CarPrepareProjectileLaunch)(car, weapon, rear, &transform, &inherited);
    return Tm3MissileLaunch(NULL, car, target, &transform, rear,
               Tm3WorldProjectile(Tm3ProjectileFreeze), 0, 0xd00000)
        != NULL;
}
