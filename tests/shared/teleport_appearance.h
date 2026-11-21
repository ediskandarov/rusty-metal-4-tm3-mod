#ifndef TM3_TEST_TELEPORT_APPEARANCE_H
#define TM3_TEST_TELEPORT_APPEARANCE_H
#include "port/extensions/teleport.h"
#include "snapshot_types.h"
typedef struct {
    u32 phase, radius;
} Tm3TestPortalVisual;
extern const SnapshotField Tm3TestPortalFields[];
int Tm3TestPortalRegister(struct RegistryDirectory*);
int Tm3TestPortal(int action);
#endif
