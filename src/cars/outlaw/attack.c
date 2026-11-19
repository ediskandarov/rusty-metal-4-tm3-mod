#include "module_import.h"
#include "special.h"
#include "tm3/lightning.h"

int Tm3CarLightning(Car* car)
{
    const Tm3LightningSettings settings = {
        .owner = car,
        .position = { car->transform.t[0], car->transform.t[1], car->transform.t[2], 0 },
        .transform = &car->transform,
        .range = 2048,
        .force = -6291456,
        .damage = 10,
        .duration = 90,
        .sound = "tm3outlaw",
        .pitch = 1558,
    };
    return WEB_MODULE("mtm3fx.sym", Tm3SpawnLightning)(&settings);
}
