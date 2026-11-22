#include "flash.h"
#include "port/extensions/screen_objects.h"
#include "snapshot_types.h"
#include "tm3/resources.h"
#include "tm4/main/game.h"
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

static void display(const void* object, Rm4ScreenDraw* draw)
{
    const Tm3ScreenFlash* flash = object;
    if (!flash->color.cd)
        return;
    struct {
        TILE tile;
        DR_TPAGE page;
    }* packets = Rm4ScreenAllocate(draw, sizeof(*packets));
    if (!packets)
        return;
    setTile(&packets->tile);
    setSemiTrans(&packets->tile, 1);
    setXY0(&packets->tile, draw->bounds.x, draw->bounds.y);
    setWH(&packets->tile, draw->bounds.w, draw->bounds.h);
    setRGB0(&packets->tile, flash->color.r, flash->color.g, flash->color.b);
    setDrawTPage(&packets->page, 0, GameInfo.dither, 0x60);
    addPrim(draw->ordering_table, &packets->tile);
    addPrim(draw->ordering_table, &packets->page);
}

int Tm3FlashRegister(RegistryDirectory* directory)
{
    return ObjectRegisterClass(flash_class, sizeof(Tm3ScreenFlash), directory,
               (Tm4PackedConstructor)construct, NULL, (Tm4ObjectCallback)process, NULL, NULL)
        && Rm4ScreenObjectRegister(flash_class, display);
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

#ifdef TM3_TEST_HOOKS
s32 Tm3TestScreenFlash(void)
{
    const Tm3ScreenFlash* flash = current_flash();
    if (!flash || !flash->color.cd)
        return -1;
    return flash->color.r | (flash->color.g << 8) | (flash->color.b << 16);
}
#endif

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
