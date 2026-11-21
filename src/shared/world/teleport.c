#include "teleport.h"
#include "tm3/resources.h"

static void arrived(const Rm4TeleportEvent* event)
{
    Tm3PlayNamedSound("tm3_s11", NULL, event->car, 1600, 0);
}

const Rm4TeleportEffects Tm3TeleportEffects = {
    .version = RM4_TELEPORT_EFFECTS_VERSION,
    .size = sizeof(Rm4TeleportEffects),
    .flags = RM4_TELEPORT_REPLACE_AUDIO,
    .arrived = arrived,
};
