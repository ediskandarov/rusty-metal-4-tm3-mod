#include "laser.h"
#include "module_import.h"
#include "remote.h"
#include "tm3/lightning.h"
#include "tm3/missile.h"
#include "tm3/resources.h"
#include "tm3/world.h"
#include "tm4/main/game.h"
#include "tm4/main/object.h"
#include "tm4/modules/car_ai.h"
#include "tm4/modules/powerup.h"
#include <stdlib.h>
#include <string.h>
#include <strings.h>

extern s32 CarWeaponCount;
void CarTrackDetonationDevice(CarWeaponInstance*, Car*, void*);
void* CarPrepareProjectileLaunch(Car*, CarWeaponInstance*, s32, MATRIX*, SVECTOR*);

typedef struct {
    const char* name;
    s16 profile;
    u32 trail_color;
} WorldWeapon;

/* Class-8 launch at 80033870. Profile colours come from
   8008a990/8008a5e8/8008aad8 after weapon initialization. */
static const WorldWeapon weapons[] = {
    { "Fire", Tm3ProjectileFire, 0x20ffff },
    { "Homing", Tm3ProjectileHoming, 0xc000c0 },
    { "Power", Tm3ProjectilePower, 0xf00000 },
    { "Speed", Tm3ProjectileSpeed, 0x50 },
    { "Napalm", Tm3ProjectileNapalm, 0x2080ff },
    { "Ricochet", Tm3ProjectileRicochet, 0 },
    { "Rain", Tm3ProjectileRain, 0 },
    { "Mortar", Tm3ProjectileMortar, 0x404040 },
};

static const WorldWeapon* definition(const char* name)
{
    for (unsigned i = 0; i < sizeof(weapons) / sizeof(weapons[0]); ++i)
        if (!strcasecmp(name, weapons[i].name))
            return &weapons[i];
    return NULL;
}

s32 Tm3LaunchWorldProjectile(Car* car, void* context, CarWeaponInstance* weapon, s32 rear)
{
    const WorldWeapon* entry = definition(weapon->descriptor->name);
    MATRIX transform;
    SVECTOR inherited;
    Car* target
        = WEB_MODULE("car", CarPrepareProjectileLaunch)(car, weapon, rear, &transform, &inherited);
    Tm3Missile* missile = Tm3MissileLaunch(NULL, car, target, &transform, rear,
        Tm3WorldProjectile(entry->profile), 0, entry->trail_color);
    if (missile && entry->profile == Tm3ProjectileRain) {
        WEB_MODULE("car", CarTrackDetonationDevice)
        (weapon, car, missile);
        weapon->next_time = 0;
        return 0;
    }
    return missile != NULL;
}

s32 Tm3LaunchLightning(Car* car, void* context, CarWeaponInstance* weapon, s32 rear)
{
    const Tm3LightningSettings settings = {
        .range = 8192,
        .force = -6291456,
        .damage = 10,
        .duration = 90,
        .flash = 1,
        .sound = "tm3_s26",
        .pitch = 0x51c,
    };
    return Tm3MarkerLightning(3, &settings);
}

static int resources_acquired;

void Tm3WorldWeaponsClassConstructor(RegistryDirectory* directory)
{
    if (!Tm3ResourcesAcquire()) {
        abort();
    }
    RegistryDirectory* resources = RegGetDirectoryPtrS("/resourcePacks/tm3");
    static const u8 samples[] = { 5, 9, 11, 12, 13, 14, 15, 22, 23, 24, 26, 27, 28, 32 };
    int ready = Tm3LaserRegister(resources) && Tm3RemoteRegister(resources);
    for (size_t i = 0; ready && i < sizeof(samples) / sizeof(*samples); ++i)
        ready = Tm3LoadSound(samples[i]);
    if (!ready) {
        Tm3ResourcesRelease();
        abort();
    }
    resources_acquired = 1;
}

void Tm3WorldWeaponsClassDestructor(RegistryDirectory* directory)
{
    if (resources_acquired) {
        Tm3ResourcesRelease();
        resources_acquired = 0;
    }
}

enum { TM3_PICKUP_NO_RESPAWN = 255 };

s32 InteractCarWithPowerupTm3(Car* car, PowerupState* power)
{
    if (power->position.fields.regeneration_seconds == TM3_PICKUP_NO_RESPAWN)
        power->respawn_delay_ticks = POWERUP_RESPAWN_DISABLED;
    if (!strcasecmp(power->name, "turbo")) {
        car->turbo_fuel = car->maximum_turbo_fuel;
    } else if (!strcasecmp(power->name, "health") || !strcasecmp(power->name, "healthFull")) {
        s32 percent = (power->units * 100 + 2048) >> 12;
        WEB_MODULE("car", CarApplyParticipantDamage)
        (car, NULL, (WebParticipantId) { 0 }, -(car->maximum_health * percent / 100), NULL, NULL);
        if (power->respawn_delay_ticks != POWERUP_RESPAWN_DISABLED) {
            const s32* rate = RegGetFileDataS("/world/ai/healthRegenRate");
            s32 cars = GameInfo.car_count > 0 ? GameInfo.car_count : 1;
            if (rate)
                power->respawn_delay_ticks = 30
                    * ((*rate * power->position.fields.regeneration_seconds * GameInfo.entrant_count
                               / cars
                           + 2048)
                        >> 12);
        }
    } else if (car->control_kind == CAR_CONTROL_PLAYER) {
        /* 8002c1b4 leaves a full pickup available to the next driver. */
        s32 count = WEB_MODULE("car", CarWeaponCount);
        CarWeaponInstance* match = NULL;
        for (s32 i = 0; i < count; ++i) {
            CarWeaponInstance* weapon = &car->weapons[i];
            if (!weapon->descriptor->name || strcasecmp(weapon->descriptor->name, power->name))
                continue;
            match = weapon;
            break;
        }
        if (!match || match->amount >= match->descriptor->maximum)
            return 0;
        s32 space = match->descriptor->maximum - match->amount;
        match->amount += power->units < space ? power->units : space;
    }
    power->sound = NULL;
    Tm3PlayNamedSound("tm3_s05", NULL, car, 2000, 0);
    return 1;
}

#ifdef TM3_TEST_HOOKS
s32 Tm3TestPickupState(void)
{
    for (s32 list = 0; list < OBJECT_LIST_COUNT; ++list)
        for (Tm4ObjectHeader* header = ObjectLists[list].first; header; header = header->next) {
            if (strcmp(header->name, "powerup"))
                continue;
            const PowerupState* power = ObjectGetPayload(header);
            return power->respawn_delay_ticks | (power->position.fields.active << 16);
        }
    return -1;
}
#endif
