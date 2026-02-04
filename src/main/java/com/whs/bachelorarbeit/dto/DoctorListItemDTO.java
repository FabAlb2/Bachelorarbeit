package com.whs.bachelorarbeit.dto;


import com.whs.bachelorarbeit.entity.FacilityType;


public record DoctorListItemDTO(

        Long doctorId,
        String name,
        String specialty,

        Long facilityId,
        String facilityName,
        FacilityType facilityType,

        String street,
        String postalCode,
        String city,
        String phone,

        Double latitude,
        Double longitude,
        Boolean wheelchairAccessible

) {



}
