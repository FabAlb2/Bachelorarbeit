package com.whs.bachelorarbeit.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record DistrictUnemploymentDTO (
        LocalDate stichtag,
        Integer stadtteilId,
        String stadtteilName,
        BigDecimal arbeitslosenanteil,
        BigDecimal arbeitslosenanteilMaennlich,
        BigDecimal arbeitslosenanteilWeiblich,
        BigDecimal arbeitslosenanteilDeutsch,
        BigDecimal arbeitslosenanteilNichtdeutsch,
        BigDecimal jugendarbeitslosigkeitU25
) {}

