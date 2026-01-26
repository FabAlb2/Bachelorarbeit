package com.whs.bachelorarbeit.service;

import com.whs.bachelorarbeit.dto.RouteDTO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@Service
public class RoutingService {

    private final RestTemplate restTemplate = new RestTemplate();
    private final String baseUrl;

    public RoutingService(@Value("${routing.osrm.base-url}") String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public RouteDTO route(double fromLat, double fromLon, double toLat, double toLon) {
        // OSRM erwartet lon,lat
        String url = String.format(
                "%s/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=geojson",
                baseUrl, fromLon, fromLat, toLon, toLat
        );

        @SuppressWarnings("unchecked")
        Map<String, Object> response = restTemplate.getForObject(url, Map.class);

        if (response == null) {
            throw new IllegalStateException("OSRM Antwort war leer.");
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> routes = (List<Map<String, Object>>) response.get("routes");
        if (routes == null || routes.isEmpty()) {
            throw new IllegalStateException("OSRM hat keine Route geliefert.");
        }

        Map<String, Object> first = routes.get(0);

        double distance = ((Number) first.get("distance")).doubleValue();
        double duration = ((Number) first.get("duration")).doubleValue();

        @SuppressWarnings("unchecked")
        Map<String, Object> geometry = (Map<String, Object>) first.get("geometry");

        @SuppressWarnings("unchecked")
        List<List<Double>> coords = (List<List<Double>>) geometry.get("coordinates");

        return new RouteDTO(distance, duration, coords);
    }
}
