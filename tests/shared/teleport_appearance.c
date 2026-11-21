/* Diagnostic appearance: exercise normal callbacks, ownership and snapshots. */
#include "teleport_appearance.h"
#include "mod_api.h"
#include "tm4/main/object.h"
#include <string.h>

static int constructions, destructions, displays;
const SnapshotField Tm3TestPortalFields[] = {
    SNAP_POD(Tm3TestPortalVisual, phase),
    SNAP_POD(Tm3TestPortalVisual, radius),
    { 0 },
};
static s32 construct(Tm3TestPortalVisual* self, va_list args)
{
    const Rm4TeleportAppearanceContext* context = va_arg(args, const Rm4TeleportAppearanceContext*);
    va_end(args);
    if (!context->registry || !ObjectGetHeader(self)->owner)
        return 0;
    self->phase = 0;
    self->radius = context->radius;
    const Tm4ShortVectorXYZ* position = &ObjectGetHeader(self)->position;
    if (position->vx != context->position.vx || position->vy != context->position.vy
        || position->vz != context->position.vz)
        return 0;
    ++constructions;
    return 1;
}
static void process(Tm3TestPortalVisual* self)
{
    ++self->phase;
}
static void destroy(Tm3TestPortalVisual* self)
{
    ++destructions;
}
static void display(void* self, Tm4OrderingTag* ot, u8** cursor, u8* limit, MATRIX* view)
{
    ++displays;
}
int Tm3TestPortalRegister(RegistryDirectory* directory)
{
    constructions = destructions = displays = 0;
    return ObjectRegisterClass("tm3TestPortalVisual", sizeof(Tm3TestPortalVisual), directory,
        (Tm4PackedConstructor)construct, NULL, (Tm4ObjectCallback)process,
        (Tm4ObjectDisplayCallback)display, (Tm4ObjectCallback)destroy);
}
int Tm3TestPortal(int action)
{
    if (action == 1)
        return constructions;
    if (action == 2)
        return destructions;
    if (action == 3)
        return displays;
    int count = 0;
    for (unsigned list = 0; list < OBJECT_LIST_COUNT; ++list)
        for (Tm4ObjectHeader* h = ObjectLists[list].first; h; h = h->next) {
            if (strcmp(h->name, "tm3TestPortalVisual"))
                continue;
            Tm4ObjectHeader* owner = ObjectGetHeader(h->owner);
            Tm3TestPortalVisual* self = ObjectGetPayload(h);
            if (!owner || strcmp(owner->name, "teleporter") || !self->radius || !self->phase
                || h->display != display || h->process != (Tm4ObjectCallback)process
                || h->destructor != (Tm4ObjectCallback)destroy)
                return -1;
            if (action == 4) {
                ObjectDestroy(h->owner);
                return 1;
            }
            ++count;
        }
    return count;
}
