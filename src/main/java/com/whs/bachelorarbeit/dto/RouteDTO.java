package com.whs.bachelorarbeit.dto;

import java.util.List;


public record RouteDTO(
        double distanceMeters,
        double durationSeconds,
        List<List<Double>> geometryLonLat

) {}
