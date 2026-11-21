/* Synthetic wheel contacts exercise the real engine adapter and loaded mod classes.
   Only linked into diagnostic modules; production effects never inspect physics. */
#include "surface.h"
#include "tm4/main/game.h"
#include "tm4/main/object.h"
#include <stdlib.h>
#include <string.h>

int Tm3TestSurface(int action, int material, int offset)
{
    Car* car = GameInfo.players[0].car;
    if (!car || !car->surface_effects.instance)
        return -1;
    Tm3WheelSurface* tracker = car->surface_effects.instance;
    if (action == 2) {
        WebSurfaceEffectsStep(car);
        return 1;
    }
    if (action == 3) {
        int mask = 0;
        for (int i = 0; i < 4; ++i) {
            const Tm3TireMark* mark = tracker->active[i];
            if (!mark)
                continue;
            if (mark->finished || abs(mark->edge[0].vx - mark->edge[2].vx) > 512
                || abs(mark->edge[0].vz - mark->edge[2].vz) > 512)
                return -1;
            mask |= 1 << i;
        }
        return mask;
    }
    if (action == 4)
        return car->surface_effects.contacts;
    if (action == 5) {
        int families = 0;
        for (unsigned list = 0; list < OBJECT_LIST_COUNT; ++list)
            for (Tm4ObjectHeader* h = ObjectLists[list].first; h; h = h->next)
                if (!strcmp(h->name, "tm3SurfaceParticle"))
                    families |= 1 << ((Tm3SurfaceParticle*)ObjectGetPayload(h))->family;
        return families;
    }
    if (action == 6) {
        ObjectDestroy(car);
        return 1;
    }
    /* Washington fixture has four materials. */
    if (material < 0 || material >= 4)
        return -1;
    MATRIX transform = car->transform;
    CarParticle saved[4];
    for (int i = 0; i < 4; ++i) {
        CarParticle* hit = car->wheels[i].response_particle;
        if (!hit)
            return -1;
        saved[i] = *hit;
    }
    WebSurfaceEffectsBegin(car);
    car->transform.t[0] += offset;
    for (int i = 0; i < 4; ++i) {
        CarParticle* hit = car->wheels[i].response_particle;
        hit->contact_state = action == 1 ? 0 : 1;
        hit->material = material;
        hit->normal = (SVECTOR) { 0, -4096, 0, 0 };
        hit->previous_position = hit->position;
        hit->previous_position.vx -= 32;
        hit->velocity_q12 = (Tm4VectorXYZ) { 4096 * 2000, 0, 0 };
        hit->slip_speed_q12 = 0x800000;
    }
    WebSurfaceEffectsStep(car);
    car->transform = transform;
    for (int i = 0; i < 4; ++i)
        *car->wheels[i].response_particle = saved[i];
    return 1;
}
