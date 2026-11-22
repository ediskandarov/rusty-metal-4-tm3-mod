#include "module_import.h"
#include "tm4/main/game.h"
#include "tm4/main/object.h"
#include "tm4/modules/car_weapon.h"
#include "tm4/modules/powerup.h"

extern s32 CarWeaponCount;
void CarWeaponProcess(Car*);

s32 Tm3TestWeaponProfiles(s32 action, s32 index, s32 value)
{
    Car* car = GameInfo.players[0].car;
    if (!car)
        return -1;
    s32 count = WEB_MODULE("car", CarWeaponCount);
    if (action == 0)
        return count;
    if (action == 5)
        return WEB_MODULE("car", CarWeaponRoleIndex)(CarWeaponSpecial);
    if (action == 6)
        return WEB_MODULE("car", CarWeaponInventoryValid)(car);
    if (index < 0 || index >= count)
        return -1;
    CarWeaponInstance* weapon = &car->weapons[index];
    switch (action) {
    case 1:
        return weapon->profile_key;
    case 2:
        return weapon->amount;
    case 3:
        car->controls.selected_weapon = car->controls.selected_weapon_slot = index;
        car->controls.weapon_pressed = 1;
        weapon->next_time = 0;
        WEB_MODULE("car", CarWeaponProcess)(car);
        return weapon->amount;
    case 4:
        weapon->amount = value;
        return weapon->amount;
    case 7:
        weapon->profile_key ^= 1;
        return weapon->profile_key;
    case 8:
        return weapon->descriptor->launch_data != NULL;
    case 9:
        return WEB_MODULE("car", CarWeaponFindProfile)(weapon->descriptor->id);
    case 10: {
        PowerupState* power = ObjectCreate("powerup", 0, weapon->descriptor->id, 30, 1,
            car->transform.t[0], car->transform.t[1], car->transform.t[2]);
        if (!power)
            return -2;
        s32 accepted = power->interact(car, power);
        ObjectDestroy(power);
        return accepted;
    }
    case 12:
        if (value < 0 || value >= 12)
            return -1;
        return WEB_MODULE("car", CarWeaponAiWeight)(car, index, value);
    case 11:
        weapon->descriptor->profile_key ^= 1;
        return 1;
    }
    return -1;
}

/* Read both the human's and the bot's immutable resource bindings. */
s32 Tm3TestWeaponAi(s32 player, s32 index, s32 sector)
{
    if (player < 0 || player >= 2 || index < 0 || index >= WEB_MODULE("car", CarWeaponCount)
        || sector < 0 || sector >= 12)
        return -1;
    Car* car = GameInfo.players[player].car;
    return car ? WEB_MODULE("car", CarWeaponAiWeight)(car, index, sector) : -1;
}
