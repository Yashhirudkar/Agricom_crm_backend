import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
} from 'class-validator';

export class TransportDetailDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsInt()
  sequence?: number;

  @IsNotEmpty({ message: 'Place of Loading (POL) is required' })
  @IsString()
  origin: string;

  @IsNotEmpty({ message: 'Shipment Type / Incoterm is required' })
  @IsString()
  incoterm: string;

  @IsNotEmpty({ message: 'Destination is required' })
  @IsString()
  destination: string;
}

