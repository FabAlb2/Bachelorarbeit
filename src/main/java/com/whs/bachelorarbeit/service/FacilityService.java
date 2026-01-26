package com.whs.bachelorarbeit.service;


import com.whs.bachelorarbeit.dto.FacilityDTO;
import com.whs.bachelorarbeit.entity.Facility;
import com.whs.bachelorarbeit.repository.FacilityRepository;
import org.springframework.stereotype.Service;

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
                .orElseThrow(() -> new RuntimeException("Facility nicht gefunden"));
        return toDto(facility);
    }


    private FacilityDTO toDto(Facility f) {
        return new FacilityDTO(
                f.getId(),
                f.getExternalId(),
                f.getName(),
                f.getPracticeName(),
                f.getType(),
                f.getLatitude(),
                f.getLongitude(),
                f.getWheelchairAccessible()
        );
    }






}
