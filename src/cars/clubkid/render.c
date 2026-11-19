#include "module_import.h"
#include "special.h"

void Tm3DisplayClubVortex(const MATRIX* transform, s32 tint, Tm4OrderingTag* ordering, u8** cursor,
    u8* limit, MATRIX* view)
{
    WEB_MODULE("mtm3fx.sym", Tm3DisplayWeaponGroup)
    (0x10, 0, tint, transform, ordering, cursor, limit, view);
}
