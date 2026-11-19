#ifndef TM3_DECORATION_H
#define TM3_DECORATION_H
#include "snapshot_types.h"
#include "tm4/main/card.h"
#include "tm4/main/registry.h"

typedef struct {
    const void* quad;
    Tm4CardQuadTexture* texture;
    s16 width, height;
} Tm3Decoration;

extern u32 Tm3DecorationSizeof;
extern const SnapshotField Tm3DecorationFields[];
s32 Tm3DecorationInstanceConstructor(Tm3Decoration* decoration, RegistryDirectory* directory);
void Tm3DecorationDisplay(
    Tm3Decoration* decoration, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view);
#endif
