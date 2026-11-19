#ifndef TM3_BILLBOARD_H
#define TM3_BILLBOARD_H
#include "tm3/resources.h"

void Tm3DrawOrientedBillboard(int angle, int depth_bias, int id, int frame, int width, int height,
    u32 color, const SVECTOR* position, Tm4OrderingTag* ordering, u8** cursor, u8* limit,
    MATRIX* view);
#endif
