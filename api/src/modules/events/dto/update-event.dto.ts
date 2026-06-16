import { PartialType } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';

/** UpdateEventDto — Sprint V3 §6: PartialType(CreateEventDto). */
export class UpdateEventDto extends PartialType(CreateEventDto) {}
