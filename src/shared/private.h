#ifndef TM3_SHARED_PRIVATE_H
#define TM3_SHARED_PRIVATE_H
#include "snapshot_types.h"
#include "tm3/resources.h"
#include "world_contact.h"

const SnapshotType* Tm3SnapshotTypes(void);
extern const WebWorldContactEffects Tm3ContactEffects;
void Tm3TeleportEffect(Car* car);
#endif
