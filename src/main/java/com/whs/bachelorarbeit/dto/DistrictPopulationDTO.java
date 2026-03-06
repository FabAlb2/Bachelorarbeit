package com.whs.bachelorarbeit.dto;

import java.time.LocalDate;


public record DistrictPopulationDTO(
        LocalDate stichtag,
        Integer stadtteilId,
        String stadtteilName,
        Integer deutsch,
        Integer deutschMit2Sta,
        Integer nichtdeutsch,
        Integer gesamt
) {}
