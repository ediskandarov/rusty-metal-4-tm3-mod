#include "checkpoint.h"
#include "tm3/resources.h"
#include "world_flash.h"

#include <stdlib.h>
#include <string.h>

static WebWorldFlash* world_flash(void)
{
    WebWorldFlash* f = RegGetFileDataS("/world/screenFlash");
    return f && RegGetFileArraySizeS("/world/screenFlash") == sizeof(*f) ? f : NULL;
}

static void update_flash(WebWorldFlash* f, CVECTOR next)
{
    if (memcmp(&f->current, &next, sizeof(next))) {
        WebCheckpointWorldWrite(&f->current, sizeof(next));
        f->current = next;
    }
}

void Tm3FlashSet(s32 lightning, s32 enabled)
{
    WebWorldFlash* f = world_flash();
    if (f) {
        CVECTOR next = lightning && enabled ? (CVECTOR) { 255, 255, 255, 0 } : f->base;
        next.cd = enabled;
        update_flash(f, next);
    }
}

void Tm3FlashStep(s32 lightning)
{
    WebWorldFlash* f = world_flash();
    if (!f)
        return;
    CVECTOR next = f->current;
    if (lightning) {
        next.cd = (rand() & 3) == 3;
    } else {
        next.r -= next.r > 12 ? 12 : next.r;
        next.g -= next.g > 12 ? 12 : next.g;
        next.b -= next.b > 12 ? 12 : next.b;
    }
    update_flash(f, next);
}
