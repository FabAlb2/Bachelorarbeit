package com.whs.bachelorarbeit.dto;

public record FacilityDTO(
        Long id,
        String facilityName,
        String type,
        String street,
        String postalCode,
        String city,
        String phone,
        Double latitude,
        Double longitude,
        Boolean wheelchairAccessible
) {}
