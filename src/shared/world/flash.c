#include "flash.h"
#include "snapshot_types.h"
#include "tm3/resources.h"
#include "tm4/main/object.h"
#include "tm4/main/system.h"
#include <stdlib.h>
#include <string.h>

static char flash_class[] = "tm3ScreenFlash";

static Tm3ScreenFlash* current_flash(void)
{
    for (Tm4ObjectHeader* h = ObjectLists[OBJECT_LIST_DEFAULT].first; h; h = h->next)
        if (!strcmp(h->name, flash_class))
            return ObjectGetPayload(h);
    return NULL;
}

static s32 construct(Tm3ScreenFlash* flash, va_list args)
{
    const CVECTOR* color = va_arg(args, const CVECTOR*);
    flash->color = *color;
    flash->color.cd = 1;
    flash->lightning = va_arg(args, s32);
    flash->remaining = va_arg(args, s32);
    flash->last_tick = GetCurrentTime();
    return 1;
}

static void process(Tm3ScreenFlash* flash)
{
    if (flash->last_tick == GetCurrentTime())
        return;
    flash->last_tick = GetCurrentTime();
    if (--flash->remaining <= 0) {
        ObjectDestroy(flash);
        return;
    }
    if (flash->lightning)
        flash->color.cd = (rand() & 3) == 3;
    else {
        flash->color.r -= flash->color.r > 12 ? 12 : flash->color.r;
        flash->color.g -= flash->color.g > 12 ? 12 : flash->color.g;
        flash->color.b -= flash->color.b > 12 ? 12 : flash->color.b;
    }
}

int Tm3FlashRegister(RegistryDirectory* directory)
{
    return ObjectRegisterClass(flash_class, sizeof(Tm3ScreenFlash), directory,
        (Tm4PackedConstructor)construct, NULL, (Tm4ObjectCallback)process, NULL, NULL);
}

void Tm3FlashStart(s32 lightning, s32 duration)
{
    const CVECTOR* base = RegGetFileDataS("/world/flashColor");
    if (!base)
        return;
    CVECTOR color = lightning ? (CVECTOR) { 255, 255, 255, 0 } : *base;
    if (!lightning) {
        s32 maximum = color.r > color.g ? color.r : color.g;
        if (color.b > maximum)
            maximum = color.b;
        duration = (maximum + 11) / 12 + 1;
    }
    Tm3ScreenFlash* previous = current_flash();
    if (previous)
        ObjectDestroy(previous);
    ObjectCreate(flash_class, 0, &color, lightning, duration);
}

s32 Tm3ScreenEffect(CVECTOR* color)
{
    const Tm3ScreenFlash* flash = current_flash();
    if (!flash || !flash->color.cd)
        return 0;
    *color = flash->color;
    return 1;
}

const SnapshotField Tm3ScreenFlashFields[] = {
    SNAP_POD(Tm3ScreenFlash, color.r),
    SNAP_POD(Tm3ScreenFlash, color.g),
    SNAP_POD(Tm3ScreenFlash, color.b),
    SNAP_POD(Tm3ScreenFlash, color.cd),
    SNAP_POD(Tm3ScreenFlash, lightning),
    SNAP_POD(Tm3ScreenFlash, remaining),
    SNAP_POD(Tm3ScreenFlash, last_tick),
    { 0 },
};
