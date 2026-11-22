#include "turbo.h"
#include "tm4/main/object.h"
#include "tm4/modules/car.h"
#include <string.h>

s32 Tm3TestTurbo(Car* car, s32 field)
{
    s32 count = 0;
    Tm3Turbo* turbo = NULL;
    for (Tm4ObjectHeader* h = ObjectLists[OBJECT_LIST_DEFAULT].first; h; h = h->next) {
        if (!strcmp(h->name, "tm3Turbo")) {
            if (field == 4)
                ++count;
            if (h->owner == car)
                turbo = ObjectGetPayload(h);
        }
        if (field == 3 && !strcmp(h->name, "tm3Sprite"))
            ++count;
    }
    switch (field) {
    case 0:
        return turbo != NULL;
    case 1:
        return turbo && turbo->loop;
    case 2:
        return car && (car->turbo_sound || car->turbo_light || car->turbo_amount);
    case 3:
    case 4:
        return count;
    case 5:
        return car ? car->turbo_thrust_applied : 0;
    case 6: {
        for (Tm4ObjectHeader* h = ObjectLists[OBJECT_LIST_SOUND].first; h; h = h->next)
            if (h->owner == turbo && turbo)
                ++count;
        return count;
    }
    default:
        return -1;
    }
}
