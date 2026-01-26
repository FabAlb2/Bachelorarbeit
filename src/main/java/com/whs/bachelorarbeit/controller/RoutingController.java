package com.whs.bachelorarbeit.controller;

import com.whs.bachelorarbeit.dto.RouteDTO;
import com.whs.bachelorarbeit.service.RoutingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RoutingController {

    private final RoutingService routingService;

    public RoutingController(RoutingService routingService) {
        this.routingService = routingService;
    }

    @GetMapping("/api/route")
    public RouteDTO route(
            @RequestParam double fromLat,
            @RequestParam double fromLon,
            @RequestParam double toLat,
            @RequestParam double toLon
    ) {
        return routingService.route(fromLat, fromLon, toLat, toLon);
    }
}
