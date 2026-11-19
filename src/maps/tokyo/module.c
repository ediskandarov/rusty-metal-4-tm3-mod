#include "module_import.h"
#include "radar.h"
#include "tm3/world.h"
#include "tm4/main/os.h"
#include <string.h>

static s32 launch(Car* car, void* context, CarWeaponInstance* weapon, s32 rear)
{
    const SVECTOR* origin = WEB_MODULE("mtm3fx.sym", Tm3WorldMarker)(2);
    const MATRIX* radar = Tm3TokyoRadarPose(car);
    if (!origin || !radar)
        return 0;
    const SVECTOR direction = { radar->m[0][2], radar->m[1][2], radar->m[2][2], 0 };
    return WEB_MODULE("mtm3fx.sym", Tm3LaunchMapBeam)(car, origin, &direction);
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
    if (!strcmp(name, "Tm3TokyoWeapons"))
        return (OSWord)&weapons;
    if (!strcmp(name, "Tm3TokyoRadar"))
        return (OSWord)&Tm3TokyoRadar;
    return 0;
}
