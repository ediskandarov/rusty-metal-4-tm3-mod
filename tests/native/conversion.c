#include "module_import.h"
#include "src/modules/car/private.h"
#include <limits.h>
#include <string.h>

/* Read the real Wasm layout, rather than duplicate C offsets in JavaScript. */
static s32 inspect(Car* car, s32 field)
{
    if (field >= 0 && field < 4)
        return car->wheels[field].radius;
    if (field >= 4 && field < 8)
        return car->wheels[field - 4].width;
    if (field >= 8 && field < 12)
        return car->wheels[field - 8].group != NULL;
    if (field >= 16 && field < 19)
        return car->transform.t[field - 16];
    switch (field) {
    case 12:
        return car->frame;
    case 13:
        return car->normal_count;
    case 14:
        return car->display_list_count;
    case 15:
        return car->health;
    case 19:
        return car->freeze_ticks;
    case 20: {
        s32 total = 0, undrawn = 0;
        for (s32 i = 0; i < car->display_list_count; ++i)
            total += car->display_lists[i].face_count;
        for (s32 i = 0; i < total; ++i)
            undrawn += car->faces[i].code == 0x28;
        return undrawn;
    }
    case 21:
        return car->original_faces != NULL;
    case 22:
        return car->controls.throttle_input;
    default:
        return -1;
    }
}
static Car* display_car;
static s32 distances[9];
static s32 display(Car* car, s32 lod, s32 frame)
{
    if (!car || car->display_list_count > 9 || lod >= car->display_list_count)
        return 0;
    if (display_car != car) {
        display_car = car;
        for (s32 i = 0; i < car->display_list_count; ++i)
            distances[i] = car->display_lists[i].max_camera_distance;
    }
    for (s32 i = 0; i < car->display_list_count; ++i)
        car->display_lists[i].max_camera_distance = lod < 0 ? distances[i] : i < lod ? -1 : INT_MAX;
    car->health = frame ? car->maximum_health / 4 : car->maximum_health;
    car->frame = frame;
    return 1;
}
static s32 freeze(Car* car)
{
    if (!WEB_MODULE("car", CarDisplayFreezeConstructor)(car))
        return 0;
    car->freeze_ticks = 8;
    return 1;
}
__attribute__((visibility("default"))) OSWord Tm4ModuleExport(const char* name)
{
    if (!strcmp(name, "inspect"))
        return (OSWord)inspect;
    if (!strcmp(name, "display"))
        return (OSWord)display;
    if (!strcmp(name, "freeze"))
        return (OSWord)freeze;
    return 0;
}
