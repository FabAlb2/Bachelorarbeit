package com.whs.bachelorarbeit.dto;




public record FacilityDTO(
        Long id,
        String externalId,
        String name,
        String practiceName,
        String type,
        Double latitude,
        Double longitude,
        Boolean wheelchairAccessible
) {}

