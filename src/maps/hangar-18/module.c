#include "module_import.h"
#include "tm3/lightning.h"
#include "tm3/prop.h"
#include "tm3/world.h"
#include "tm4/main/os.h"
#include <string.h>

extern const Tm3PropBehavior Tm3HangarSaucer;

static s32 Tm3LaunchHangarSpaceship(Car* car, void* context, CarWeaponInstance* weapon, s32 rear)
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

__attribute__((visibility("default"))) OSWord Tm4ModuleExport(const char* name)
{
    if (!strcmp(name, "Tm3LaunchHangarSpaceship"))
        return (OSWord)Tm3LaunchHangarSpaceship;
    if (!strcmp(name, "Tm3HangarSaucer"))
        return (OSWord)&Tm3HangarSaucer;
    return 0;
}
