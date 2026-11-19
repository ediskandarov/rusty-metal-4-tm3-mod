#include "world_weapons.h"
#include "laser.h"
#include "module_import.h"
#include "remote.h"
#include "tm3/lightning.h"
#include "tm3/missile.h"
#include "tm3/resources.h"
#include "tm4/main/game.h"
#include "tm4/main/object.h"
#include "tm4/modules/car_ai.h"
#include "world_pickups.h"
#include <string.h>
#include <strings.h>

extern s32 CarWeaponCount;
void CarTrackDetonationDevice(CarWeaponInstance*, Car*, void*);
void* CarPrepareProjectileLaunch(Car*, CarWeaponInstance*, s32, MATRIX*, SVECTOR*);

typedef struct {
    const char* name;
    s16 initial, maximum;
    s16 profile;
    u32 trail_color;
} WorldWeapon;

/* SCUS_942.49: initial ammo and capacity at 8007e0f8, class-8 launch at 80033870.
   Profile colours come from 8008a990/8008a5e8/8008aad8 after weapon initialization. */
static const WorldWeapon weapons[] = {
    { "Fire", 2, 10, Tm3ProjectileFire, 0x20ffff },
    { "Homing", 0, 10, Tm3ProjectileHoming, 0xc000c0 },
    { "Power", 0, 5, Tm3ProjectilePower, 0xf00000 },
    { "Speed", 0, 30, Tm3ProjectileSpeed, 0x50 },
    { "Napalm", 1, 10, Tm3ProjectileNapalm, 0x2080ff },
    { "Proximity", 0, 10, -1, 0 }, /* Each map selects its own special pickup. */
    { "Remote", 0, 5, -1, 0 },
    { "Ricochet", 0, 3, Tm3ProjectileRicochet, 0 },
    { "Rain", 0, 10, Tm3ProjectileRain, 0 },
    { "Mortar", 0, 10, Tm3ProjectileMortar, 0x404040 },
    { "Lightning", 0, 10, -1, 0 },
};

static const WorldWeapon* definition(const char* name)
{
    for (unsigned i = 0; i < sizeof(weapons) / sizeof(weapons[0]); ++i)
        if (!strcasecmp(name, weapons[i].name))
            return &weapons[i];
    return NULL;
}

static s32 launch(Car* car, void* context, CarWeaponInstance* weapon, s32 rear)
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

static s32 lightning(Car* car, void* context, CarWeaponInstance* weapon, s32 rear)
{
    return Tm3MapLightning(!strcasecmp(weapon->descriptor->name, "Proximity") ? 5 : 3);
}

static void configure(CarWeaponDescriptor* weapon)
{
    const WorldWeapon* entry = definition(weapon->name);
    if (!entry)
        return;
    if (!strcasecmp(entry->name, "Proximity")) {
        char* title = RegGetFileDataS("/world/tm3MapWeapon");
        if (!title)
            return;
        weapon->hud_name = title;
        weapon->detonate = 0;
        if (!strcmp(title, "Eye"))
            weapon->launch = Tm3UseEye;
        else if (!strcmp(title, "Radar"))
            weapon->launch = Tm3FireRadar;
        else
            weapon->launch = lightning;
    }
    weapon->initial = entry->initial;
    weapon->maximum = entry->maximum;
    /* 8002cfbc and 80033d30: Speed uses 0x334 Q12 seconds, the others 0x1000. */
    weapon->delay = entry->profile == Tm3ProjectileSpeed ? 6 : 30;
    if (entry->profile == Tm3ProjectileRain)
        weapon->detonate = 1;
    if (!strcasecmp(entry->name, "Remote")) {
        weapon->detonate = 1;
        weapon->launch = Tm3PlaceRemote;
    } else if (!strcasecmp(entry->name, "Lightning")) {
        weapon->launch = lightning;
    } else if (entry->profile >= 0)
        weapon->launch = launch;
}

static s32 acquire(void)
{
    if (!Tm3ResourcesAcquire())
        return 0;
    RegistryDirectory* resources = RegGetDirectoryPtrS("/resourcePacks/tm3");
    static const u8 samples[] = { 5, 9, 11, 12, 13, 14, 15, 22, 23, 24, 26, 27, 28, 32 };
    int ready = Tm3LaserRegister(resources) && Tm3RemoteRegister(resources);
    for (size_t i = 0; ready && i < sizeof(samples) / sizeof(*samples); ++i)
        ready = Tm3LoadSound(samples[i]);
    if (!ready)
        Tm3ResourcesRelease();
    return ready;
}

const WebWorldWeapons Tm3WorldWeapons = { acquire, configure, Tm3ResourcesRelease };

static s32 handles(const char* name)
{
    if (!strcasecmp(name, "Proximity"))
        return RegGetFileDataS("/world/tm3MapWeapon") != NULL;
    return definition(name) || !strcasecmp(name, "health") || !strcasecmp(name, "healthFull")
        || !strcasecmp(name, "turbo");
}

static void initialize_pickup(PowerupState* power)
{
    /* 8002bd2c chooses rand() % 1024; the stock constructor already took the draw. */
    power->angle &= 1023;
    ObjectSetInteractionRadius(power, 40);
}

static void update_pickup(PowerupState* power)
{
    if (power->position.fields.active == POWERUP_AVAILABLE) {
        power->angle = (power->angle + 200) & 4095;
        return;
    }
    if (power->inactive_ticks++ >= power->respawn_delay_ticks
        && power->respawn_delay_ticks != POWERUP_RESPAWN_DISABLED) {
        power->position.fields.active = POWERUP_AVAILABLE;
        power->inactive_ticks = 0;
    }
}

static s32 collect(Car* car, PowerupState* power)
{
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
    Tm3PlayNamedSound("tm3_s05", NULL, car, 2000, 0);
    return 1;
}

const WebWorldPickups Tm3WorldPickups = { handles, collect, initialize_pickup, update_pickup };
