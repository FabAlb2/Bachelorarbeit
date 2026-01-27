package com.whs.bachelorarbeit.service;

import com.whs.bachelorarbeit.dto.FacilityDTO;
import com.whs.bachelorarbeit.entity.Facility;
import com.whs.bachelorarbeit.repository.FacilityRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;

@Service
public class FacilityService {

    private final FacilityRepository facilityRepository;

    public FacilityService(FacilityRepository facilityRepository) {
        this.facilityRepository = facilityRepository;
    }

    public List<FacilityDTO> getAll() {
        return facilityRepository.findAll()
                .stream()
                .map(this::toDto)
                .toList();
    }

    public FacilityDTO getById(Long id) {
        Facility facility = facilityRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Facility nicht gefunden: " + id));
        return toDto(facility);
    }

    private FacilityDTO toDto(Facility f) {
        return new FacilityDTO(
                f.getId(),
                f.getFacilityName(),
                f.getType(),
                f.getStreet(),
                f.getPostalCode(),
                f.getCity(),
                f.getPhone(),
                f.getLatitude(),
                f.getLongitude(),
                f.getWheelchairAccessible()
        );
    }
}
