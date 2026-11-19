#include "module_import.h"
#include "tm3/lightning.h"
#include "tm3/prop.h"
#include "tm3/world.h"
#include "tm4/main/os.h"
#include <string.h>

extern const Tm3PropBehavior Tm3HangarSaucer;

static s32 launch(Car* car, void* context, CarWeaponInstance* weapon, s32 rear)
{
    const Tm3LightningSettings settings = {
        .range = 6144,
        .force = -2097152,
        .damage = 20,
        .duration = 90,
        .flash = 1,
        .sound = "tm3_s26",
        .pitch = 0x51c,
    };
    return WEB_MODULE("mtm3fx.sym", Tm3MarkerLightning)(5, &settings);
}

static s32 acquire(void)
{
    return WEB_MODULE("mtm3fx.sym", Tm3WorldWeapons).acquire();
}

static void configure(CarWeaponDescriptor* weapon)
{
    WEB_MODULE("mtm3fx.sym", Tm3WorldWeapons).configure(weapon);
    if (!strcmp(weapon->name, "Proximity"))
        weapon->launch = launch;
}

static void release(void)
{
    WEB_MODULE("mtm3fx.sym", Tm3WorldWeapons).release();
}

static const WebWorldWeapons weapons = {
    acquire,
    configure,
    release,
};

__attribute__((visibility("default"))) OSWord Tm4ModuleExport(const char* name)
{
    if (!strcmp(name, "Tm3HangarWeapons"))
        return (OSWord)&weapons;
    if (!strcmp(name, "Tm3HangarSaucer"))
        return (OSWord)&Tm3HangarSaucer;
    return 0;
}
