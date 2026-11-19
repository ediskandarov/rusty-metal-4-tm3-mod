#include "eye.h"
#include "module_import.h"
#include "tm3/world.h"
#include "tm4/main/os.h"
#include <string.h>

static s32 acquire(void)
{
    if (!WEB_MODULE("mtm3fx.sym", Tm3WorldWeapons).acquire())
        return 0;
    if (Tm3EyeRegister())
        return 1;
    WEB_MODULE("mtm3fx.sym", Tm3WorldWeapons).release();
    return 0;
}

static void configure(CarWeaponDescriptor* weapon)
{
    WEB_MODULE("mtm3fx.sym", Tm3WorldWeapons).configure(weapon);
    if (!strcmp(weapon->name, "Proximity"))
        weapon->launch = Tm3UseEye;
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
    if (!strcmp(name, "Tm3EgyptWeapons"))
        return (OSWord)&weapons;
    if (!strcmp(name, "__rm4_snapshot_types"))
        return (OSWord)Tm3EyeSnapshots;
    return 0;
}
